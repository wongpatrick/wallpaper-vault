"""
CRUD and lifecycle orchestration for Sets.
Handles create, update, merge, import, and deletion workflows.
"""

import os
from pathlib import Path
import shutil
from typing import Optional
import anyio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import structlog

from app.core.aspect_ratio import get_aspect_ratio_labels
from app.core.crop import load_image
from app.core.enums import ImageRating
from app.core.exceptions import FileSystemError, ResourceNotFoundError
from app.core.image_analysis import calculate_dominant_color, calculate_phash
from app.core.utils import sanitize_filename
from app.core.vault_utils import resolve_vault_root
from app.crud import set as crud_set
from app.crud.creator import create_creator, get_creator_by_name
from app.models.creator import Creator
from app.models.image import Image
from app.models.set import Set
from app.schemas.creator import CreatorCreate
from app.schemas.set import SetBulkUpdate, SetCreate, SetImport, SetUpdate
from app.services.image_service import delete_image_thumbnails
from app.services.set_filesystem_service import rename_set_folder_if_needed

logger = structlog.get_logger(__name__)


async def create_set(db: AsyncSession, set_in: SetCreate) -> Set:
    """Creates a new Set record and performs necessary file system/image processing."""
    h_label, v_label = await get_aspect_ratio_labels(db)

    if set_in.images:
        for image_in in set_in.images:
            if image_in.local_path:
                p = anyio.Path(image_in.local_path)
                if await p.exists():
                    p_lib = Path(image_in.local_path)

                    if not image_in.phash:
                        image_in.phash = await anyio.to_thread.run_sync(
                            calculate_phash, p_lib
                        )

                    if image_in.width is None or image_in.height is None:
                        img_cv = await anyio.to_thread.run_sync(
                            load_image, str(p)
                        )
                        if img_cv is not None:
                            height, width = img_cv.shape[:2]
                            image_in.width = width
                            image_in.height = height
                            image_in.aspect_ratio = (
                                float(width) / float(height) if height != 0 else 0
                            )

                    if not image_in.aspect_ratio_label:
                        w = image_in.width
                        h = image_in.height
                        if w is not None and h is not None:
                            image_in.aspect_ratio_label = (
                                h_label if w >= h else v_label
                            )

                    if image_in.file_size is None:
                        stat = await p.stat()
                        image_in.file_size = stat.st_size

                    if image_in.dominant_color is None:
                        image_in.dominant_color = await anyio.to_thread.run_sync(
                            calculate_dominant_color, p_lib
                        )

    # Auto-generate local_path if not provided
    if not set_in.local_path:
        base_dir, resolved_lp_id = await resolve_vault_root(
            db, set_in.library_path_id
        )
        set_in.library_path_id = resolved_lp_id

        creator_names = []
        if set_in.creator_ids:
            result = await db.execute(
                select(Creator).where(Creator.id.in_(set_in.creator_ids))
            )
            creators = result.scalars().all()
            creator_names = [c.canonical_name for c in creators]

        creators_str = (
            " & ".join(creator_names) if creator_names else "Unknown"
        )
        sanitized_title = (
            sanitize_filename(set_in.title or "") or "Untitled"
        )
        new_folder_name = f"{creators_str} - {sanitized_title}"

        new_path = anyio.Path(str(base_dir)) / new_folder_name
        try:
            await new_path.mkdir(parents=True, exist_ok=True)
            set_in.local_path = str(new_path)
        except Exception as e:
            logger.error(
                "Failed to create auto-generated set folder",
                path=str(new_path),
                error=str(e),
            )
            raise FileSystemError(
                f"Failed to create physical directory '{new_path}': {str(e)}"
            ) from e

    db_set = await crud_set.create_set(db, set_in)
    await db.commit()
    await db.refresh(db_set)
    return await crud_set.get_set(db, db_set.id)


async def update_set(
    db: AsyncSession, set_id: int, set_in: SetUpdate
) -> Set:
    db_set = await crud_set.get_set(db, set_id)
    if not db_set:
        raise ResourceNotFoundError("Set not found")

    db_set = await crud_set.update_set(db, set_id, set_in)
    await rename_set_folder_if_needed(db, db_set)
    db.add(db_set)
    await db.commit()
    await db.refresh(db_set)
    return await crud_set.get_set(db, set_id)


async def merge_sets(
    db: AsyncSession, source_ids: list[int], target_id: int
) -> Set:
    target_set = await crud_set.get_set(db, target_id)
    if not target_set:
        raise ResourceNotFoundError("Target set not found")

    target_path = (
        anyio.Path(target_set.local_path) if target_set.local_path else None
    )

    if target_path and not await target_path.exists():
        try:
            await target_path.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            logger.error(
                "Could not create target directory",
                path=str(target_path),
                error=str(e),
            )

    for sid in source_ids:
        if sid == target_id:
            continue

        source_set = await crud_set.get_set(db, sid)
        if not source_set:
            continue

        if not target_path and source_set.local_path:
            target_path = anyio.Path(source_set.local_path)
            target_set.local_path = str(target_path)
            if not await target_path.exists():
                try:
                    await target_path.mkdir(parents=True, exist_ok=True)
                except Exception as e:
                    logger.error(
                        "Could not create adopted target directory",
                        path=str(target_path),
                        error=str(e),
                    )

        failed_images = []
        if target_path:
            for img in source_set.images:
                old_p = (
                    anyio.Path(img.local_path) if img.local_path else None
                )
                if not old_p:
                    continue

                new_p = target_path / old_p.name

                if await old_p.exists() and old_p.parent != target_path:
                    counter = 1
                    actual_new_p = new_p
                    while await actual_new_p.exists():
                        actual_new_p = (
                            target_path
                            / f"{old_p.stem}_{counter}{old_p.suffix}"
                        )
                        counter += 1

                    try:
                        await anyio.to_thread.run_sync(
                            shutil.move, str(old_p), str(actual_new_p)
                        )
                        img.local_path = str(actual_new_p)
                    except Exception as e:
                        logger.error(
                            "Error moving image",
                            path=str(old_p),
                            error=str(e),
                            exc_info=True,
                        )
                        failed_images.append(img)
                elif await new_p.exists():
                    img.local_path = str(new_p)

        images_to_move = [
            img for img in source_set.images if img not in failed_images
        ]
        source_set.images = failed_images

        for img in images_to_move:
            img.set_id = target_id
            target_set.images.append(img)

        for c in list(source_set.creators):
            if c not in target_set.creators:
                target_set.creators.append(c)
        source_set.creators = []

        for t in list(source_set.tags):
            if t not in target_set.tags:
                target_set.tags.append(t)
        source_set.tags = []

        for char in list(source_set.characters):
            if char not in target_set.characters:
                target_set.characters.append(char)
        source_set.characters = []

        if source_set.notes:
            target_set.notes = (
                (target_set.notes or "") + "\n" + source_set.notes
            ).strip()

        source_path = source_set.local_path

        if not failed_images:
            await db.flush()
            await db.delete(source_set)

            if (
                source_path
                and target_path
                and str(anyio.Path(source_path)) != str(target_path)
            ):
                try:
                    await anyio.to_thread.run_sync(os.rmdir, source_path)
                except OSError:
                    pass

    await db.commit()
    await db.refresh(target_set)
    await rename_set_folder_if_needed(db, target_set)

    return await crud_set.get_set(db, target_id)


async def import_set(db: AsyncSession, set_in: SetImport) -> Set:
    db_creators = []
    for name in set_in.creator_names:
        creator = await get_creator_by_name(db, name)
        if not creator:
            creator = await create_creator(
                db, CreatorCreate(canonical_name=name)
            )
        db_creators.append(creator)

    creator_ids = [c.id for c in db_creators]
    db_set = await crud_set.get_set_by_title_and_creators(
        db, set_in.title, creator_ids, load_relations=True
    )

    if db_set is None:
        db_set = Set(
            title=set_in.title,
            local_path=set_in.local_path,
            notes=set_in.notes,
        )
        db_set.creators = db_creators
        db.add(db_set)
    else:
        if set_in.notes:
            if db_set.notes:
                db_set.notes = f"{db_set.notes}\n{set_in.notes}".strip()
            else:
                db_set.notes = set_in.notes
        existing_creator_ids = {c.id for c in db_set.creators}
        for c in db_creators:
            if c.id not in existing_creator_ids:
                db_set.creators.append(c)

    if set_in.images:
        h_label, v_label = await get_aspect_ratio_labels(db)

        new_images = []
        for image_in in set_in.images:
            img_data = image_in.model_dump()

            p = anyio.Path(img_data["local_path"])
            p_lib = Path(img_data["local_path"])

            if not img_data.get("phash"):
                img_data["phash"] = await anyio.to_thread.run_sync(
                    calculate_phash, p_lib
                )

            if (
                img_data.get("width") is None
                or img_data.get("height") is None
            ):
                img_cv = await anyio.to_thread.run_sync(
                    load_image, img_data["local_path"]
                )
                if img_cv is not None:
                    height, width = img_cv.shape[:2]
                    img_data["width"] = width
                    img_data["height"] = height
                    img_data["aspect_ratio"] = (
                        float(width) / float(height) if height != 0 else 0
                    )

            if not img_data.get("aspect_ratio_label"):
                w = img_data.get("width")
                h = img_data.get("height")
                if w is not None and h is not None:
                    img_data["aspect_ratio_label"] = (
                        h_label if w >= h else v_label
                    )

            if img_data.get("file_size") is None:
                if await p.exists():
                    stat = await p.stat()
                    img_data["file_size"] = stat.st_size
                else:
                    img_data["file_size"] = None

            if not img_data.get("rating"):
                img_data["rating"] = ImageRating.QUESTIONABLE

            new_images.append(Image(**img_data))

        db_set.images.extend(new_images)

    await db.commit()
    await db.refresh(db_set)
    return await crud_set.get_set(db, db_set.id)


async def bulk_update_sets(
    db: AsyncSession, bulk_in: SetBulkUpdate
) -> int:
    count = await crud_set.bulk_update_sets(db, bulk_in)

    result = await db.execute(
        select(Set)
        .options(selectinload(Set.creators), selectinload(Set.images))
        .where(Set.id.in_(bulk_in.set_ids))
    )
    db_sets = result.scalars().all()
    for db_set in db_sets:
        await rename_set_folder_if_needed(db, db_set)
        db.add(db_set)
    await db.commit()
    return count


async def delete_set(db: AsyncSession, set_id: int) -> Optional[Set]:
    """Deletes a set record and its associated physical folder and thumbnail caches."""
    db_set = await crud_set.get_set(db, set_id)
    if not db_set:
        return None

    image_ids = [img.id for img in db_set.images]
    local_path_str = db_set.local_path

    deleted_set = await crud_set.delete_set(db, set_id)

    if local_path_str:
        local_path = Path(local_path_str)
        if local_path.exists() and local_path.is_dir():
            try:
                await anyio.to_thread.run_sync(shutil.rmtree, local_path)
            except PermissionError as e:
                await db.rollback()
                logger.warning(
                    "Failed to delete set folder due to PermissionError, rolling back",
                    path=local_path_str,
                )
                raise e
            except Exception as e:
                await db.rollback()
                logger.error(
                    "Failed to delete set folder, rolling back",
                    path=local_path_str,
                    error=str(e),
                )
                raise e

    for img_id in image_ids:
        delete_image_thumbnails(img_id)

    await db.commit()
    return deleted_set


async def bulk_delete_sets(db: AsyncSession, set_ids: list[int]) -> int:
    """Bulk deletes sets and their physical folders and thumbnail caches."""
    result = await db.execute(
        select(Set).options(selectinload(Set.images)).where(Set.id.in_(set_ids))
    )
    db_sets = result.scalars().all()

    if not db_sets:
        return 0

    all_image_ids = []
    folders_to_delete = []

    for db_set in db_sets:
        all_image_ids.extend([img.id for img in db_set.images])
        if db_set.local_path:
            folders_to_delete.append(db_set.local_path)

    count = await crud_set.bulk_delete_sets(db, set_ids)

    for folder_str in folders_to_delete:
        folder_path = Path(folder_str)
        if folder_path.exists() and folder_path.is_dir():
            try:
                await anyio.to_thread.run_sync(shutil.rmtree, folder_path)
            except PermissionError as e:
                await db.rollback()
                logger.warning(
                    "Failed to delete set folder in bulk delete due to PermissionError, rolling back",
                    path=folder_str,
                )
                raise e
            except Exception as e:
                await db.rollback()
                logger.error(
                    "Failed to delete set folder in bulk delete, rolling back",
                    path=folder_str,
                    error=str(e),
                )
                raise e

    for img_id in all_image_ids:
        delete_image_thumbnails(img_id)

    await db.commit()
    return count
