"""
Service layer for cross-vault and local library path transfers.
Handles metadata export, preflight collision detection, image binary staging,
atomic transfer finalization, and local filesystem set/image relocation.
"""
import os
import re
import shutil
import uuid
from pathlib import Path
from typing import Optional

import anyio
import structlog
from fastapi import UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.thumbnails import SIZE_WIDTHS, _generate_thumbnail_file
from app.core.aspect_ratio import get_aspect_ratio_labels
from app.core.color_utils import get_color_bucket
from app.core.constants import THUMBS_DIR
from app.core.enums import ImageRating
from app.core.exceptions import AppError, FileSystemError, ResourceNotFoundError
from app.core.image_analysis import calculate_dominant_color, calculate_phash
from app.core.utils import sanitize_filename
from app.core.vault_utils import resolve_vault_root
from app.crud import library_path as crud_library_path
from app.crud import set as crud_set
from app.crud.character import (
    get_all_characters_by_name,
    get_character_by_name_and_franchise_name,
    get_characters_by_names,
)
from app.crud.creator import create_creator
from app.crud.franchise import get_franchise_by_name, get_or_create_franchise
from app.crud.tag import get_tags_by_names
from app.models.character import Character
from app.models.creator import Creator
from app.models.image import Image
from app.models.set import Set
from app.models.tag import Tag
from app.schemas.creator import CreatorCreate
from app.schemas.vault_transfer import (
    CharacterTransferMeta,
    CreatorTransferMeta,
    ImageCollisionItem,
    ImageTransferMeta,
    IngestImageResponse,
    LocalTransferRequest,
    LocalTransferResponse,
    SetCollisionItem,
    SetTransferPackage,
    TaxonomyResolutionSummary,
    TransferFinalizeRequest,
    TransferFinalizeResponse,
    TransferPreflightResult,
)
from app.services.audit_service import PHASH_MATCH_MAX_DISTANCE

logger = structlog.get_logger(__name__)

TEMP_IMPORTS_DIR: Path = Path(__file__).resolve().parent.parent.parent / "temp_imports"
SESSION_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


def _validate_session_id(session_id: str) -> str:
    """Validate transfer_session_id to prevent path traversal."""
    if not session_id or not SESSION_ID_PATTERN.match(session_id):
        raise AppError("Invalid transfer_session_id format")
    return session_id


def _get_staging_dir(session_id: str) -> Path:
    """Return the temporary staging directory path for a given transfer session."""
    valid_id = _validate_session_id(session_id)
    return TEMP_IMPORTS_DIR / f"transfer_{valid_id}"


def _sanitize_image_filename(raw_filename: Optional[str]) -> str:
    """Sanitize an image filename across operating systems while preserving its extension."""
    cleaned = (raw_filename or "image.jpg").replace("\\", "/").rstrip("/")
    name = Path(cleaned).name or "image.jpg"
    p = Path(name)
    safe_stem = sanitize_filename(p.stem) or "image"
    suffix = p.suffix if p.suffix else ".jpg"
    return f"{safe_stem}{suffix}"


def _serialize_character(char: Character) -> CharacterTransferMeta:
    """Serialize a Character SQLAlchemy model into CharacterTransferMeta."""
    return CharacterTransferMeta(
        name=char.name,
        franchise_name=char.franchise.name if char.franchise else None,
    )


def _serialize_image(img: Image) -> ImageTransferMeta:
    """Serialize an Image SQLAlchemy model into ImageTransferMeta."""
    return ImageTransferMeta(
        id=img.id,
        filename=img.filename,
        phash=img.phash,
        width=img.width,
        height=img.height,
        file_size=img.file_size,
        aspect_ratio=img.aspect_ratio,
        aspect_ratio_label=img.aspect_ratio_label,
        sort_order=img.sort_order,
        notes=img.notes,
        rating=img.rating or ImageRating.SAFE,
        dominant_color=img.dominant_color,
        dominant_color_bucket=img.dominant_color_bucket,
        focal_point_x=img.focal_point_x if img.focal_point_x is not None else 50,
        focal_point_y=img.focal_point_y if img.focal_point_y is not None else 50,
        is_favorite=bool(img.is_favorite),
        is_blacklisted=bool(img.is_blacklisted),
        tags=[t.name for t in (img.tags or [])],
        characters=[_serialize_character(c) for c in (img.characters or [])],
    )


def _serialize_set_package(db_set: Set, images_override: Optional[list[Image]] = None) -> SetTransferPackage:
    """Serialize a Set model (and either all its images or a subset) into SetTransferPackage."""
    imgs = images_override if images_override is not None else (db_set.images or [])
    return SetTransferPackage(
        source_set_id=db_set.id,
        title=db_set.title,
        source_url=db_set.source_url,
        phash=db_set.phash,
        notes=db_set.notes,
        creators=[
            CreatorTransferMeta(
                canonical_name=c.canonical_name,
                type=c.type,
                notes=c.notes,
                socials=c.socials,
            )
            for c in (db_set.creators or [])
        ],
        tags=[t.name for t in (db_set.tags or [])],
        characters=[_serialize_character(c) for c in (db_set.characters or [])],
        images=[_serialize_image(img) for img in imgs],
    )


async def export_set(db: AsyncSession, set_id: int) -> SetTransferPackage:
    """Export complete metadata package for a single Set and all its images."""
    stmt = (
        select(Set)
        .options(
            selectinload(Set.creators),
            selectinload(Set.tags),
            selectinload(Set.characters).selectinload(Character.franchise),
            selectinload(Set.images).selectinload(Image.tags),
            selectinload(Set.images).selectinload(Image.characters).selectinload(Character.franchise),
        )
        .where(Set.id == set_id)
    )
    res = await db.execute(stmt)
    db_set = res.scalar_one_or_none()
    if not db_set:
        raise ResourceNotFoundError(f"Set with ID {set_id} not found")

    return _serialize_set_package(db_set)


async def export_images(db: AsyncSession, image_ids: list[int]) -> list[SetTransferPackage]:
    """Export metadata packages for cherry-picked images, grouped by their parent Set."""
    if not image_ids:
        return []

    stmt = (
        select(Image)
        .options(
            selectinload(Image.tags),
            selectinload(Image.characters).selectinload(Character.franchise),
            selectinload(Image.set).selectinload(Set.creators),
            selectinload(Image.set).selectinload(Set.tags),
            selectinload(Image.set).selectinload(Set.characters).selectinload(Character.franchise),
        )
        .where(Image.id.in_(image_ids))
    )
    res = await db.execute(stmt)
    images = list(res.scalars().all())
    if not images:
        raise ResourceNotFoundError("No matching images found for export")

    grouped_sets: dict[int, tuple[Set, list[Image]]] = {}
    orphan_images: list[Image] = []

    for img in images:
        if img.set:
            if img.set_id not in grouped_sets:
                grouped_sets[img.set_id] = (img.set, [])
            grouped_sets[img.set_id][1].append(img)
        else:
            orphan_images.append(img)

    packages: list[SetTransferPackage] = []
    for db_set, set_imgs in grouped_sets.values():
        packages.append(_serialize_set_package(db_set, images_override=set_imgs))

    if orphan_images:
        packages.append(
            SetTransferPackage(
                source_set_id=None,
                title="Transferred Wallpapers",
                images=[_serialize_image(img) for img in orphan_images],
            )
        )

    return packages


def _hamming_distance_hex(phash_a: str, phash_b: str) -> Optional[int]:
    """Compute bitwise Hamming distance between two 64-bit hex perceptual hashes."""
    try:
        return (int(phash_a, 16) ^ int(phash_b, 16)).bit_count()
    except (ValueError, TypeError):
        return None


async def preflight_check(
    db: AsyncSession, packages: list[SetTransferPackage]
) -> TransferPreflightResult:
    """
    Evaluate incoming transfer packages against the destination database.
    Detects colliding sets, duplicate/near-duplicate images by pHash, and missing taxonomy items.
    """
    transfer_session_id = uuid.uuid4().hex
    set_collisions: list[SetCollisionItem] = []
    image_collisions: list[ImageCollisionItem] = []

    # 1. Gather unique taxonomy names across all packages and images
    creator_names: dict[str, str] = {}
    franchise_names: dict[str, str] = {}
    character_keys: dict[tuple[str, Optional[str]], CharacterTransferMeta] = {}
    tag_names: dict[str, str] = {}

    for pkg in packages:
        for c in pkg.creators:
            if c.canonical_name and c.canonical_name.strip():
                clean = c.canonical_name.strip()
                creator_names[clean.lower()] = clean
        for t in pkg.tags:
            if t and t.strip():
                clean = t.strip()
                tag_names[clean.lower()] = clean
        for ch in pkg.characters:
            if ch.name and ch.name.strip():
                c_name = ch.name.strip()
                f_name = ch.franchise_name.strip() if ch.franchise_name and ch.franchise_name.strip() else None
                character_keys[(c_name.lower(), f_name.lower() if f_name else None)] = CharacterTransferMeta(
                    name=c_name, franchise_name=f_name
                )
                if f_name:
                    franchise_names[f_name.lower()] = f_name

        for img in pkg.images:
            for t in img.tags:
                if t and t.strip():
                    clean = t.strip()
                    tag_names[clean.lower()] = clean
            for ch in img.characters:
                if ch.name and ch.name.strip():
                    c_name = ch.name.strip()
                    f_name = ch.franchise_name.strip() if ch.franchise_name and ch.franchise_name.strip() else None
                    character_keys[(c_name.lower(), f_name.lower() if f_name else None)] = CharacterTransferMeta(
                        name=c_name, franchise_name=f_name
                    )
                    if f_name:
                        franchise_names[f_name.lower()] = f_name

    taxonomy = TaxonomyResolutionSummary()

    # Check Creators
    creator_id_by_lower: dict[str, int] = {}
    for lower_name, display_name in creator_names.items():
        res = await db.execute(
            select(Creator).where(func.lower(Creator.canonical_name) == lower_name)
        )
        existing_c = res.scalars().first()
        if existing_c:
            taxonomy.existing_creators.append(display_name)
            creator_id_by_lower[lower_name] = existing_c.id
        else:
            taxonomy.missing_creators.append(display_name)

    # Check Franchises
    for lower_name, display_name in franchise_names.items():
        existing_f = await get_franchise_by_name(db, display_name)
        if existing_f:
            taxonomy.existing_franchises.append(display_name)
        else:
            taxonomy.missing_franchises.append(display_name)

    # Check Characters
    for (_c_lower, _f_lower), ch_meta in character_keys.items():
        label = ch_meta.to_lookup_string()
        if ch_meta.franchise_name:
            existing_ch = await get_character_by_name_and_franchise_name(
                db, ch_meta.name, ch_meta.franchise_name
            )
        else:
            matches = await get_all_characters_by_name(db, ch_meta.name)
            existing_ch = matches[0] if matches else None
        if existing_ch:
            taxonomy.existing_characters.append(label)
        else:
            taxonomy.missing_characters.append(label)

    # Check Tags
    for lower_name, display_name in tag_names.items():
        res = await db.execute(select(Tag).where(func.lower(Tag.name) == lower_name))
        if res.scalars().first():
            taxonomy.existing_tags.append(display_name)
        else:
            taxonomy.missing_tags.append(display_name)

    # 2. Check Set Collisions
    for pkg in packages:
        matched_set: Optional[Set] = None
        match_reason: Optional[str] = None

        if pkg.source_url and pkg.source_url.strip():
            res = await db.execute(
                select(Set).where(Set.source_url == pkg.source_url.strip())
            )
            matched_set = res.scalars().first()
            if matched_set:
                match_reason = "source_url"

        if not matched_set and pkg.title and pkg.title.strip():
            pkg_creator_lowers = [
                c.canonical_name.strip().lower()
                for c in pkg.creators
                if c.canonical_name and c.canonical_name.strip()
            ]
            # Only possible to match by title + creators if all creators exist on destination
            if all(cl in creator_id_by_lower for cl in pkg_creator_lowers):
                c_ids = [creator_id_by_lower[cl] for cl in pkg_creator_lowers]
                matched_set = await crud_set.get_set_by_title_and_creators(
                    db, pkg.title.strip(), c_ids, load_relations=False
                )
                if matched_set:
                    match_reason = "title_and_creators"

        if matched_set and match_reason:
            set_collisions.append(
                SetCollisionItem(
                    source_set_id=pkg.source_set_id,
                    source_title=pkg.title,
                    existing_set_id=matched_set.id,
                    existing_title=matched_set.title,
                    match_reason=match_reason,  # type: ignore[arg-type]
                )
            )

    # 3. Check Image Collisions (pHash Hamming distance <= PHASH_MATCH_MAX_DISTANCE)
    db_img_rows = (
        await db.execute(
            select(Image.id, Image.phash, Image.set_id, Set.title)
            .outerjoin(Set, Image.set_id == Set.id)
            .where(Image.phash.is_not(None))
        )
    ).all()

    parsed_db_hashes: list[tuple[int, int, int, Optional[str]]] = []
    for row_id, row_phash, row_set_id, row_set_title in db_img_rows:
        if row_phash:
            try:
                parsed_db_hashes.append(
                    (row_id, int(row_phash, 16), row_set_id, row_set_title)
                )
            except ValueError:
                continue

    for pkg in packages:
        for img in pkg.images:
            if not img.phash:
                continue
            try:
                inc_int = int(img.phash, 16)
            except ValueError:
                continue

            best_dist = PHASH_MATCH_MAX_DISTANCE + 1
            best_match: Optional[tuple[int, int, Optional[str]]] = None

            for db_id, db_hash_int, db_set_id, db_set_title in parsed_db_hashes:
                dist = (inc_int ^ db_hash_int).bit_count()
                if dist < best_dist:
                    best_dist = dist
                    best_match = (db_id, db_set_id, db_set_title)
                    if dist == 0:
                        break

            if best_match is not None and best_dist <= PHASH_MATCH_MAX_DISTANCE:
                image_collisions.append(
                    ImageCollisionItem(
                        source_image_id=img.id,
                        filename=img.filename,
                        source_phash=img.phash,
                        existing_image_id=best_match[0],
                        existing_set_id=best_match[1],
                        existing_set_title=best_match[2],
                        hamming_distance=best_dist,
                    )
                )

    return TransferPreflightResult(
        transfer_session_id=transfer_session_id,
        set_collisions=set_collisions,
        image_collisions=image_collisions,
        taxonomy=taxonomy,
    )


def _save_upload_file_sync(upload_file: UploadFile, dest_path: Path) -> None:
    """Write UploadFile stream to disk synchronously."""
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer)


async def ingest_image(
    transfer_session_id: str,
    source_image_id: int,
    file: UploadFile,
) -> IngestImageResponse:
    """Stage an uploaded image binary into temp_imports/transfer_{session_id}."""
    staging_dir = _get_staging_dir(transfer_session_id)
    safe_name = _sanitize_image_filename(file.filename)
    staged_filename = f"{source_image_id}_{safe_name}"
    dest_path = staging_dir / staged_filename

    try:
        await anyio.to_thread.run_sync(_save_upload_file_sync, file, dest_path)
    finally:
        await file.close()

    return IngestImageResponse(
        transfer_session_id=transfer_session_id,
        source_image_id=source_image_id,
        staged_filename=staged_filename,
        status="staged",
    )


def _warm_thumbnails_sync(image_entries: list[tuple[int, Path]]) -> None:
    """Generate cached thumbnails for newly transferred images in a background thread."""
    for image_id, file_path in image_entries:
        if not file_path.exists():
            continue
        for size_name, target_width in SIZE_WIDTHS.items():
            thumb_path = THUMBS_DIR / f"{image_id}_{size_name}.jpg"
            if not thumb_path.exists():
                _generate_thumbnail_file(file_path, thumb_path, target_width)


async def warm_thumbnails_background(image_entries: list[tuple[int, Path]]) -> None:
    """Background task wrapper to warm thumbnails for transferred images."""
    try:
        await anyio.to_thread.run_sync(_warm_thumbnails_sync, image_entries)
    except Exception as e:
        logger.warning("Failed warming thumbnails after transfer", error=str(e))


async def _resolve_or_create_creators(
    db: AsyncSession, creator_metas: list[CreatorTransferMeta]
) -> list[Creator]:
    """Resolve existing creators by canonical name (case-insensitive) or create new ones."""
    db_creators: list[Creator] = []
    for c_meta in creator_metas:
        name = (c_meta.canonical_name or "").strip()
        if not name:
            continue
        res = await db.execute(
            select(Creator).where(func.lower(Creator.canonical_name) == name.lower())
        )
        creator = res.scalars().first()
        if not creator:
            creator = await create_creator(
                db,
                CreatorCreate(
                    canonical_name=name,
                    type=c_meta.type,
                    notes=c_meta.notes,
                    socials=c_meta.socials,
                ),
            )
        db_creators.append(creator)
    return db_creators


async def _resolve_or_create_characters(
    db: AsyncSession, char_metas: list[CharacterTransferMeta]
) -> list[Character]:
    """Resolve or create franchises and characters."""
    lookup_strings: list[str] = []
    for ch in char_metas:
        if ch.franchise_name and ch.franchise_name.strip():
            await get_or_create_franchise(db, ch.franchise_name.strip())
        if ch.name and ch.name.strip():
            lookup_strings.append(ch.to_lookup_string())
    if not lookup_strings:
        return []
    return list(await get_characters_by_names(db, lookup_strings))


def _allocate_unique_set_dir(vault_root: Path, base_folder_name: str) -> Path:
    """Return a directory path under vault_root, appending a suffix if already non-empty."""
    candidate = vault_root / base_folder_name
    if not candidate.exists():
        candidate.mkdir(parents=True, exist_ok=True)
        return candidate

    counter = 2
    while True:
        alt = vault_root / f"{base_folder_name} ({counter})"
        if not alt.exists():
            alt.mkdir(parents=True, exist_ok=True)
            return alt
        counter += 1


async def _find_colliding_set(
    db: AsyncSession,
    pkg: SetTransferPackage,
    creator_ids: list[int],
) -> Optional[Set]:
    """Find an existing Set on the destination matching by source_url or (title, creators)."""
    if pkg.source_url and pkg.source_url.strip():
        res = await db.execute(
            select(Set)
            .options(
                selectinload(Set.creators),
                selectinload(Set.tags),
                selectinload(Set.characters),
                selectinload(Set.images),
            )
            .where(Set.source_url == pkg.source_url.strip())
        )
        matched = res.scalars().first()
        if matched:
            return matched

    if pkg.title and pkg.title.strip():
        return await crud_set.get_set_by_title_and_creators(
            db, pkg.title.strip(), creator_ids, load_relations=True
        )
    return None


async def finalize_transfer(
    db: AsyncSession,
    req: TransferFinalizeRequest,
) -> tuple[TransferFinalizeResponse, list[tuple[int, Path]]]:
    """
    Commit staged images and metadata into the destination database and library folder.
    Returns (TransferFinalizeResponse, list of (image_id, file_path) for thumbnail generation).
    """
    staging_dir = _get_staging_dir(req.transfer_session_id)
    packages = req.get_packages()
    if not packages:
        raise AppError("No transfer packages provided to finalize")

    vault_root, target_lp_id = await resolve_vault_root(db, None)
    h_label, v_label = await get_aspect_ratio_labels(db)

    excluded_ids = set(req.excluded_source_image_ids or [])

    # Pre-fetch existing pHashes if skip_duplicate_images is enabled
    existing_phashes: list[int] = []
    if req.skip_duplicate_images:
        rows = (
            await db.execute(select(Image.phash).where(Image.phash.is_not(None)))
        ).scalars().all()
        for ph in rows:
            if ph:
                try:
                    existing_phashes.append(int(ph, 16))
                except ValueError:
                    continue

    # Check if a global target set override was requested
    override_set: Optional[Set] = None
    if req.target_set_id is not None:
        override_set = await crud_set.get_set(db, req.target_set_id)
        if not override_set:
            raise ResourceNotFoundError(f"Target set {req.target_set_id} not found")
    elif req.target_set_title and req.target_set_title.strip():
        clean_title = req.target_set_title.strip()
        res = await db.execute(
            select(Set)
            .options(
                selectinload(Set.creators),
                selectinload(Set.tags),
                selectinload(Set.characters),
                selectinload(Set.images),
            )
            .where(Set.title == clean_title)
        )
        override_set = res.scalars().first()
        if not override_set:
            first_creators = await _resolve_or_create_creators(db, packages[0].creators)
            creators_str = (
                " & ".join(c.canonical_name for c in first_creators)
                if first_creators
                else "Unknown"
            )
            folder_name = sanitize_filename(f"{creators_str} - {clean_title}") or "Untitled"
            dest_dir = _allocate_unique_set_dir(vault_root, folder_name)
            override_set = Set(
                title=clean_title,
                local_path=str(dest_dir.resolve()),
                library_path_id=target_lp_id,
            )
            override_set.creators = first_creators
            override_set.tags = []
            override_set.characters = []
            override_set.images = []
            db.add(override_set)
            await db.flush()

    created_or_updated_set_ids: list[int] = []
    transferred_count = 0
    skipped_count = 0
    thumb_entries: list[tuple[int, Path]] = []

    try:
        for pkg in packages:
            db_creators = await _resolve_or_create_creators(db, pkg.creators)
            creator_ids = [c.id for c in db_creators]
            pkg_tags = await get_tags_by_names(db, pkg.tags)
            pkg_chars = await _resolve_or_create_characters(db, pkg.characters)

            target_set: Optional[Set] = override_set
            if target_set is None:
                colliding_set = await _find_colliding_set(db, pkg, creator_ids)
                if colliding_set and req.set_collision_strategy == "merge":
                    target_set = colliding_set
                    existing_c_ids = {c.id for c in target_set.creators}
                    for c in db_creators:
                        if c.id not in existing_c_ids:
                            target_set.creators.append(c)
                            existing_c_ids.add(c.id)

                    existing_t_ids = {t.id for t in target_set.tags}
                    for t in pkg_tags:
                        if t.id not in existing_t_ids:
                            target_set.tags.append(t)
                            existing_t_ids.add(t.id)

                    existing_ch_ids = {ch.id for ch in target_set.characters}
                    for ch in pkg_chars:
                        if ch.id not in existing_ch_ids:
                            target_set.characters.append(ch)
                            existing_ch_ids.add(ch.id)

                    if pkg.notes and pkg.notes.strip():
                        if not target_set.notes:
                            target_set.notes = pkg.notes.strip()
                        elif pkg.notes.strip() not in target_set.notes:
                            target_set.notes = f"{target_set.notes}\n{pkg.notes.strip()}"
                else:
                    creators_str = (
                        " & ".join(c.canonical_name for c in db_creators)
                        if db_creators
                        else "Unknown"
                    )
                    sanitized_title = sanitize_filename(pkg.title or "Untitled") or "Untitled"
                    base_folder = sanitize_filename(f"{creators_str} - {sanitized_title}") or sanitized_title
                    dest_dir = _allocate_unique_set_dir(vault_root, base_folder)

                    # Avoid UNIQUE constraint violation on source_url if creating a new set anyway
                    safe_source_url = pkg.source_url.strip() if pkg.source_url and pkg.source_url.strip() else None
                    if safe_source_url:
                        url_exists = (
                            await db.execute(
                                select(Set.id).where(Set.source_url == safe_source_url)
                            )
                        ).scalars().first()
                        if url_exists:
                            safe_source_url = None

                    target_set = Set(
                        title=pkg.title or "Untitled",
                        source_url=safe_source_url,
                        phash=pkg.phash,
                        notes=pkg.notes,
                        local_path=str(dest_dir.resolve()),
                        library_path_id=target_lp_id,
                    )
                    target_set.creators = db_creators
                    target_set.tags = pkg_tags
                    target_set.characters = pkg_chars
                    target_set.images = []
                    db.add(target_set)
                    await db.flush()

            if target_set.id not in created_or_updated_set_ids:
                created_or_updated_set_ids.append(target_set.id)

            # Ensure target_set has a valid directory on disk
            if not target_set.local_path:
                creators_str = (
                    " & ".join(c.canonical_name for c in target_set.creators)
                    if target_set.creators
                    else "Unknown"
                )
                sanitized_title = sanitize_filename(target_set.title or "Untitled") or "Untitled"
                dest_dir = _allocate_unique_set_dir(
                    vault_root, sanitize_filename(f"{creators_str} - {sanitized_title}")
                )
                target_set.local_path = str(dest_dir.resolve())
                target_set.library_path_id = target_set.library_path_id or target_lp_id

            set_dir = Path(target_set.local_path)
            set_dir.mkdir(parents=True, exist_ok=True)

            for img_meta in pkg.images:
                if img_meta.id in excluded_ids:
                    skipped_count += 1
                    continue

                if req.skip_duplicate_images and img_meta.phash:
                    try:
                        inc_int = int(img_meta.phash, 16)
                        is_dup = any(
                            (inc_int ^ db_int).bit_count() <= PHASH_MATCH_MAX_DISTANCE
                            for db_int in existing_phashes
                        )
                        if is_dup:
                            skipped_count += 1
                            continue
                    except ValueError:
                        pass

                # Locate staged file
                safe_name = _sanitize_image_filename(img_meta.filename)
                expected_staged = staging_dir / f"{img_meta.id}_{safe_name}"
                if not expected_staged.exists():
                    matches = list(staging_dir.glob(f"{img_meta.id}_*")) if staging_dir.exists() else []
                    if not matches:
                        raise FileSystemError(
                            f"Staged file for source image {img_meta.id} ({safe_name}) not found"
                        )
                    expected_staged = matches[0]

                # Determine unique target path inside set_dir
                dest_file = set_dir / safe_name
                counter = 1
                while dest_file.exists():
                    dest_file = set_dir / f"{Path(safe_name).stem}_{counter}{Path(safe_name).suffix}"
                    counter += 1

                await anyio.to_thread.run_sync(
                    shutil.move, str(expected_staged), str(dest_file)
                )

                # Fill any missing image properties
                phash_val = img_meta.phash or await anyio.to_thread.run_sync(
                    calculate_phash, dest_file
                )
                dom_color = img_meta.dominant_color or await anyio.to_thread.run_sync(
                    calculate_dominant_color, dest_file
                )
                dom_bucket = img_meta.dominant_color_bucket or (
                    get_color_bucket(dom_color) if dom_color else None
                )
                file_size = img_meta.file_size or dest_file.stat().st_size
                width = img_meta.width
                height = img_meta.height
                aspect_ratio = img_meta.aspect_ratio
                if aspect_ratio is None and width and height:
                    aspect_ratio = float(width) / float(height)
                ar_label = img_meta.aspect_ratio_label
                if not ar_label and width and height:
                    ar_label = h_label if width >= height else v_label

                img_tags = await get_tags_by_names(db, img_meta.tags)
                img_chars = await _resolve_or_create_characters(db, img_meta.characters)

                new_img = Image(
                    set_id=target_set.id,
                    filename=dest_file.name,
                    local_path=str(dest_file.resolve()),
                    phash=phash_val,
                    width=width,
                    height=height,
                    file_size=file_size,
                    aspect_ratio=aspect_ratio,
                    aspect_ratio_label=ar_label,
                    sort_order=img_meta.sort_order,
                    notes=img_meta.notes,
                    rating=img_meta.rating or ImageRating.SAFE,
                    dominant_color=dom_color,
                    dominant_color_bucket=dom_bucket,
                    focal_point_x=img_meta.focal_point_x if img_meta.focal_point_x is not None else 50,
                    focal_point_y=img_meta.focal_point_y if img_meta.focal_point_y is not None else 50,
                    is_favorite=img_meta.is_favorite,
                    is_blacklisted=img_meta.is_blacklisted,
                    tags=img_tags,
                    characters=img_chars,
                )
                db.add(new_img)
                await db.flush()

                if phash_val:
                    try:
                        existing_phashes.append(int(phash_val, 16))
                    except ValueError:
                        pass

                transferred_count += 1
                thumb_entries.append((new_img.id, dest_file))

            await crud_set.recalculate_set_rollup_tags(db, target_set.id, additive=True)

        await db.commit()
    finally:
        if staging_dir.exists():
            await anyio.to_thread.run_sync(shutil.rmtree, staging_dir, True)

    return (
        TransferFinalizeResponse(
            created_set_ids=created_or_updated_set_ids,
            transferred_image_count=transferred_count,
            skipped_image_count=skipped_count,
        ),
        thumb_entries,
    )


async def _move_single_set_to_library_path(
    db: AsyncSession, db_set: Set, dest_root: Path, dest_lp_id: int
) -> tuple[int, str]:
    """Relocate an entire Set and all its images to a destination LibraryPath on disk."""
    old_set_dir = Path(db_set.local_path) if db_set.local_path else None
    if old_set_dir and old_set_dir.name:
        folder_name = old_set_dir.name
    else:
        creators_str = (
            " & ".join(c.canonical_name for c in db_set.creators)
            if db_set.creators
            else "Unknown"
        )
        sanitized_title = sanitize_filename(db_set.title or "Untitled") or "Untitled"
        folder_name = sanitize_filename(f"{creators_str} - {sanitized_title}") or sanitized_title

    new_set_dir = dest_root / folder_name
    if old_set_dir and os.path.normcase(str(old_set_dir.resolve())) == os.path.normcase(
        str(new_set_dir.resolve())
    ):
        db_set.library_path_id = dest_lp_id
        db.add(db_set)
        return len(db_set.images), str(new_set_dir.resolve())

    if new_set_dir.exists():
        new_set_dir = _allocate_unique_set_dir(dest_root, folder_name)
    else:
        new_set_dir.mkdir(parents=True, exist_ok=True)

    moved_count = 0
    for img in db_set.images:
        if not img.local_path:
            continue
        old_p = Path(img.local_path)
        new_p = new_set_dir / old_p.name
        counter = 1
        while new_p.exists() and os.path.normcase(str(old_p.resolve())) != os.path.normcase(
            str(new_p.resolve())
        ):
            new_p = new_set_dir / f"{old_p.stem}_{counter}{old_p.suffix}"
            counter += 1

        if old_p.exists():
            await anyio.to_thread.run_sync(shutil.move, str(old_p), str(new_p))
            img.local_path = str(new_p.resolve())
            img.filename = new_p.name
            db.add(img)
            moved_count += 1

    if old_set_dir and old_set_dir.exists():
        try:
            await anyio.to_thread.run_sync(os.rmdir, str(old_set_dir))
        except OSError:
            pass

    db_set.local_path = str(new_set_dir.resolve())
    db_set.library_path_id = dest_lp_id
    db.add(db_set)
    return moved_count, str(new_set_dir.resolve())


async def local_transfer(
    db: AsyncSession, req: LocalTransferRequest
) -> LocalTransferResponse:
    """
    Move a Set or selected Images to another LibraryPath within the same vault using shutil.move.
    """
    dest_lp = await crud_library_path.get_library_path(db, req.destination_library_path_id)
    if not dest_lp or not dest_lp.path:
        raise ResourceNotFoundError(
            f"Destination library path {req.destination_library_path_id} not found"
        )

    dest_root = Path(dest_lp.path)
    dest_root.mkdir(parents=True, exist_ok=True)

    # Case 1: Full Set Transfer
    if req.set_id is not None and not req.image_ids:
        db_set = await crud_set.get_set(db, req.set_id)
        if not db_set:
            raise ResourceNotFoundError(f"Set {req.set_id} not found")

        moved_count, new_path = await _move_single_set_to_library_path(
            db, db_set, dest_root, dest_lp.id
        )
        await db.commit()
        return LocalTransferResponse(
            set_ids=[db_set.id],
            moved_image_count=moved_count,
            new_local_paths=[new_path],
        )

    # Case 2: Cherry-picked Images Transfer
    if not req.image_ids:
        raise AppError("Either set_id or image_ids must be provided for local transfer")

    stmt = (
        select(Image)
        .options(
            selectinload(Image.set).selectinload(Set.creators),
            selectinload(Image.set).selectinload(Set.tags),
            selectinload(Image.set).selectinload(Set.characters),
            selectinload(Image.set).selectinload(Set.images),
        )
        .where(Image.id.in_(req.image_ids))
    )
    images = list((await db.execute(stmt)).scalars().all())
    if not images:
        raise ResourceNotFoundError("No matching images found to move")

    # If an explicit target set or target set title is provided, move all selected images into it
    if req.target_set_id is not None or (req.target_set_title and req.target_set_title.strip()):
        if req.target_set_id is not None:
            target_set = await crud_set.get_set(db, req.target_set_id)
            if not target_set:
                raise ResourceNotFoundError(f"Target set {req.target_set_id} not found")
            if target_set.library_path_id != dest_lp.id:
                await _move_single_set_to_library_path(db, target_set, dest_root, dest_lp.id)
        else:
            clean_title = req.target_set_title.strip()  # type: ignore[union-attr]
            first_set = images[0].set
            creators = list(first_set.creators) if first_set else []
            creators_str = (
                " & ".join(c.canonical_name for c in creators) if creators else "Unknown"
            )
            folder_name = sanitize_filename(f"{creators_str} - {clean_title}") or clean_title
            new_dir = _allocate_unique_set_dir(dest_root, folder_name)
            target_set = Set(
                title=clean_title,
                local_path=str(new_dir.resolve()),
                library_path_id=dest_lp.id,
            )
            target_set.creators = creators
            db.add(target_set)
            await db.flush()

        target_dir = Path(target_set.local_path)  # type: ignore[arg-type]
        target_dir.mkdir(parents=True, exist_ok=True)
        moved_count = 0

        for img in images:
            old_p = Path(img.local_path) if img.local_path else None
            if old_p and old_p.exists():
                new_p = target_dir / old_p.name
                counter = 1
                while new_p.exists() and os.path.normcase(str(old_p.resolve())) != os.path.normcase(
                    str(new_p.resolve())
                ):
                    new_p = target_dir / f"{old_p.stem}_{counter}{old_p.suffix}"
                    counter += 1
                await anyio.to_thread.run_sync(shutil.move, str(old_p), str(new_p))
                img.local_path = str(new_p.resolve())
                img.filename = new_p.name
            img.set_id = target_set.id
            db.add(img)
            moved_count += 1

        await crud_set.recalculate_set_rollup_tags(db, target_set.id, additive=True)
        await db.commit()
        return LocalTransferResponse(
            set_ids=[target_set.id],
            moved_image_count=moved_count,
            new_local_paths=[str(target_dir.resolve())],
        )

    # Otherwise, group images by source set.
    # If all images in a source set were selected, relocate that set directly;
    # if only a subset of images was selected, create a new set in dest_lp for those images.
    by_set: dict[int, list[Image]] = {}
    for img in images:
        by_set.setdefault(img.set_id, []).append(img)

    affected_set_ids: list[int] = []
    new_paths: list[str] = []
    total_moved = 0

    for source_set_id, selected_imgs in by_set.items():
        source_set = selected_imgs[0].set
        if source_set and len(selected_imgs) == len(source_set.images):
            moved, new_p = await _move_single_set_to_library_path(
                db, source_set, dest_root, dest_lp.id
            )
            affected_set_ids.append(source_set.id)
            new_paths.append(new_p)
            total_moved += moved
        else:
            creators = list(source_set.creators) if source_set else []
            creators_str = (
                " & ".join(c.canonical_name for c in creators) if creators else "Unknown"
            )
            title = source_set.title if source_set and source_set.title else "Untitled"
            folder_name = sanitize_filename(f"{creators_str} - {title}") or title
            new_dir = _allocate_unique_set_dir(dest_root, folder_name)
            split_set = Set(
                title=title,
                notes=source_set.notes if source_set else None,
                local_path=str(new_dir.resolve()),
                library_path_id=dest_lp.id,
            )
            split_set.creators = creators
            split_set.tags = list(source_set.tags) if source_set else []
            split_set.characters = list(source_set.characters) if source_set else []
            db.add(split_set)
            await db.flush()

            for img in selected_imgs:
                old_p = Path(img.local_path) if img.local_path else None
                if old_p and old_p.exists():
                    new_p = new_dir / old_p.name
                    counter = 1
                    while new_p.exists():
                        new_p = new_dir / f"{old_p.stem}_{counter}{old_p.suffix}"
                        counter += 1
                    await anyio.to_thread.run_sync(shutil.move, str(old_p), str(new_p))
                    img.local_path = str(new_p.resolve())
                    img.filename = new_p.name
                img.set_id = split_set.id
                db.add(img)
                total_moved += 1

            await crud_set.recalculate_set_rollup_tags(db, split_set.id, additive=True)
            affected_set_ids.append(split_set.id)
            new_paths.append(str(new_dir.resolve()))

    await db.commit()
    return LocalTransferResponse(
        set_ids=affected_set_ids,
        moved_image_count=total_moved,
        new_local_paths=new_paths,
    )
