"""
Service for library auditing and health checks.
Provides functionality for finding ghost files, orphaned files, and matching visual hashes.
"""

import asyncio
from collections import defaultdict
import os
from pathlib import Path
from typing import Optional
import cv2
import numpy as np
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import structlog

from app.core import tasks
from app.core.crop import load_image
from app.core.enums import AuditIssueType, TaskStatus
from app.core.image_analysis import calculate_dominant_color, calculate_phash
from app.core.vault_utils import resolve_all_vault_roots
from app.crud.settings import get_setting
from app.db.session import SessionLocal
from app.models.audit import AuditIssue
from app.models.character import Character
from app.models.creator import Creator
from app.models.image import Image
from app.models.set import Set
from app.models.tag import Tag

logger = structlog.get_logger(__name__)

PHASH_MATCH_MAX_DISTANCE: int = 5

# Re-export for backwards compatibility if external callers still import from here
__all__ = [
    "calculate_phash",
    "calculate_dominant_color",
    "run_library_audit",
]


async def _audit_ghosts_and_corrupted(
    db: AsyncSession, task_id: str, all_images: list[Image]
) -> tuple[list[AuditIssue], list[AuditIssue], list[AuditIssue]]:
    """Audit database images for missing (ghost), corrupted, or path-mismatched files."""
    ghosts: list[AuditIssue] = []
    corrupted_images: list[AuditIssue] = []
    path_mismatches: list[AuditIssue] = []
    total_images = len(all_images)

    for idx, img in enumerate(all_images):
        if not img.local_path:
            ghosts.append(
                AuditIssue(
                    task_id=task_id,
                    issue_type=AuditIssueType.GHOST,
                    path="UNKNOWN",
                    directory="UNKNOWN",
                    image_id=img.id,
                    set_id=img.set_id,
                    expected_phash=img.phash,
                )
            )
            continue

        p = Path(img.local_path)
        if not p.exists():
            ghosts.append(
                AuditIssue(
                    task_id=task_id,
                    issue_type=AuditIssueType.GHOST,
                    path=img.local_path,
                    directory=str(p.parent),
                    image_id=img.id,
                    set_id=img.set_id,
                    expected_phash=img.phash,
                )
            )
        else:
            try:
                img_cv = load_image(p)
                if img_cv is None:
                    corrupted_images.append(
                        AuditIssue(
                            task_id=task_id,
                            issue_type=AuditIssueType.CORRUPTED_IMAGE,
                            path=img.local_path,
                            directory=str(p.parent),
                            image_id=img.id,
                            set_id=img.set_id,
                        )
                    )
                    continue
            except Exception:
                corrupted_images.append(
                    AuditIssue(
                        task_id=task_id,
                        issue_type=AuditIssueType.CORRUPTED_IMAGE,
                        path=img.local_path,
                        directory=str(p.parent),
                        image_id=img.id,
                        set_id=img.set_id,
                    )
                )
                continue

            if (
                img.set
                and img.set.local_path
                and os.path.exists(img.set.local_path)
            ):
                img_dir = os.path.normcase(os.path.normpath(str(p.parent)))
                set_dir = os.path.normcase(
                    os.path.normpath(str(img.set.local_path))
                )
                if img_dir != set_dir:
                    path_mismatches.append(
                        AuditIssue(
                            task_id=task_id,
                            issue_type=AuditIssueType.PATH_MISMATCH,
                            path=img.local_path,
                            directory=str(img.set.local_path),
                            image_id=img.id,
                            set_id=img.set_id,
                        )
                    )

        if idx % 10 == 0:
            await asyncio.sleep(0)

        if idx % 100 == 0 and total_images > 0:
            prog = 5 + int((idx / total_images) * 40)
            await tasks.update_task(
                db,
                task_id,
                progress=prog,
                status=f"Scanning Database ({idx}/{total_images})...",
            )
            logger.info("Audit: Ghost Hunt progress", scanned=idx, total=total_images)

    if ghosts:
        db.add_all(ghosts)
    if corrupted_images:
        db.add_all(corrupted_images)
    if path_mismatches:
        db.add_all(path_mismatches)
    await db.flush()

    return ghosts, corrupted_images, path_mismatches


async def _audit_filesystem_orphans(
    db: AsyncSession,
    task_id: str,
    vault_roots: list[Path],
    all_images: list[Image],
    all_sets: list[Set],
) -> list[AuditIssue]:
    """Scan filesystem for images not tracked in the database."""
    image_exts = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"}
    all_db_paths = {
        os.path.normcase(os.path.normpath(img.local_path))
        for img in all_images
        if img.local_path
    }
    set_dir_map = {
        os.path.normcase(os.path.normpath(s.local_path)): s.id
        for s in all_sets
        if s.local_path
    }

    orphans: list[AuditIssue] = []
    files_found = 0
    for vault_root in vault_roots:
        if not vault_root.exists() or not vault_root.is_dir():
            continue
        for r, _, f in os.walk(vault_root):
            dir_path = os.path.normpath(r)
            matching_set_id = set_dir_map.get(os.path.normcase(dir_path))
            for file in f:
                if Path(file).suffix.lower() in image_exts:
                    full_p = os.path.normpath(os.path.join(r, file))
                    files_found += 1
                    if os.path.normcase(full_p) not in all_db_paths:
                        try:
                            img_cv = load_image(Path(full_p))
                            if img_cv is None:
                                orphans.append(
                                    AuditIssue(
                                        task_id=task_id,
                                        issue_type=AuditIssueType.CORRUPTED_IMAGE,
                                        path=full_p,
                                        directory=dir_path,
                                        set_id=matching_set_id,
                                    )
                                )
                                continue
                        except Exception:
                            orphans.append(
                                AuditIssue(
                                    task_id=task_id,
                                    issue_type=AuditIssueType.CORRUPTED_IMAGE,
                                    path=full_p,
                                    directory=dir_path,
                                    set_id=matching_set_id,
                                )
                            )
                            continue

                        orphans.append(
                            AuditIssue(
                                task_id=task_id,
                                issue_type=AuditIssueType.ORPHAN,
                                path=full_p,
                                directory=dir_path,
                                set_id=matching_set_id,
                            )
                        )

                    if files_found % 50 == 0:
                        await asyncio.sleep(0)
                    if files_found % 200 == 0:
                        await tasks.update_task(
                            db,
                            task_id,
                            status=f"Scanning Filesystem ({files_found} files checked, {len(orphans)} orphans found)...",
                        )
                        logger.info(
                            "Audit: Orphan Hunt progress",
                            files_checked=files_found,
                            orphans_found=len(orphans),
                        )

    if orphans:
        db.add_all(orphans)
        await db.flush()
    return orphans


async def _audit_set_integrity(
    db: AsyncSession,
    task_id: str,
    all_sets: list[Set],
    all_images: list[Image],
) -> list[AuditIssue]:
    """Check for empty sets and ghost set folders missing on disk."""
    set_image_counts: dict[int, int] = {}
    for img in all_images:
        if img.set_id:
            set_image_counts[img.set_id] = set_image_counts.get(img.set_id, 0) + 1

    set_issues: list[AuditIssue] = []
    for s in all_sets:
        if not s.local_path or not os.path.exists(s.local_path):
            set_issues.append(
                AuditIssue(
                    task_id=task_id,
                    issue_type=AuditIssueType.GHOST_SET,
                    path=s.local_path or "UNKNOWN",
                    directory=s.local_path or "UNKNOWN",
                    set_id=s.id,
                )
            )
        elif set_image_counts.get(s.id, 0) == 0:
            set_issues.append(
                AuditIssue(
                    task_id=task_id,
                    issue_type=AuditIssueType.EMPTY_SET,
                    path=s.local_path,
                    directory=s.local_path,
                    set_id=s.id,
                )
            )

    if set_issues:
        db.add_all(set_issues)
        await db.flush()
    return set_issues


async def _audit_orphan_db_records(
    db: AsyncSession, task_id: str
) -> list[AuditIssue]:
    """Find unused tags, creators, and characters."""
    orphan_db_issues: list[AuditIssue] = []

    unused_tags = (
        (
            await db.execute(
                select(Tag).where(~Tag.images.any(), ~Tag.sets.any())
            )
        )
        .scalars()
        .all()
    )
    for t in unused_tags:
        orphan_db_issues.append(
            AuditIssue(
                task_id=task_id,
                issue_type=AuditIssueType.ORPHAN_TAG,
                path=f"{t.name}:{t.id}",
                directory="tag",
            )
        )

    unused_creators = (
        (await db.execute(select(Creator).filter(~Creator.sets.any())))
        .scalars()
        .all()
    )
    for c in unused_creators:
        orphan_db_issues.append(
            AuditIssue(
                task_id=task_id,
                issue_type=AuditIssueType.ORPHAN_CREATOR,
                path=f"{c.canonical_name}:{c.id}",
                directory="creator",
            )
        )

    unused_characters = (
        (await db.execute(select(Character).filter(~Character.sets.any())))
        .scalars()
        .all()
    )
    for ch in unused_characters:
        orphan_db_issues.append(
            AuditIssue(
                task_id=task_id,
                issue_type=AuditIssueType.ORPHAN_CHARACTER,
                path=f"{ch.name}:{ch.id}",
                directory="character",
            )
        )

    if orphan_db_issues:
        db.add_all(orphan_db_issues)
        await db.flush()
    return orphan_db_issues


async def _audit_duplicate_paths(
    db: AsyncSession, task_id: str, all_images: list[Image]
) -> list[AuditIssue]:
    """Find multiple database records pointing to identical filesystem paths."""
    path_map: dict[str, list[Image]] = defaultdict(list)
    for img in all_images:
        if img.local_path:
            norm_p = os.path.normcase(os.path.normpath(img.local_path))
            path_map[norm_p].append(img)

    duplicate_issues: list[AuditIssue] = []
    for path, imgs in path_map.items():
        if len(imgs) > 1:
            imgs.sort(key=lambda x: x.id)
            for redundant_img in imgs[1:]:
                duplicate_issues.append(
                    AuditIssue(
                        task_id=task_id,
                        issue_type=AuditIssueType.DUPLICATE_ENTRY,
                        path=path,
                        directory=path,
                        image_id=redundant_img.id,
                        set_id=redundant_img.set_id,
                    )
                )

    if duplicate_issues:
        db.add_all(duplicate_issues)
        await db.flush()
    return duplicate_issues


async def _match_visual_hashes(db: AsyncSession, task_id: str) -> None:
    """Match orphan files to ghost DB records via OpenCV perceptual hash."""
    res = await db.execute(
        select(AuditIssue).filter(AuditIssue.task_id == task_id)
    )
    found_issues = res.scalars().all()

    task_ghosts = [
        i for i in found_issues if i.issue_type == AuditIssueType.GHOST
    ]
    task_orphans = [
        i for i in found_issues if i.issue_type == AuditIssueType.ORPHAN
    ]

    if not task_ghosts or not task_orphans:
        return

    ghost_image_ids = [g.image_id for g in task_ghosts if g.image_id]
    if not ghost_image_ids:
        return

    g_imgs_res = await db.execute(
        select(Image).filter(Image.id.in_(ghost_image_ids))
    )
    ghost_db_images = {img.id: img for img in g_imgs_res.scalars().all()}

    hasher = cv2.img_hash.PHash_create()
    ghost_hashes: dict[int, cv2.Mat] = {}
    for g in task_ghosts:
        if g.image_id in ghost_db_images:
            db_img = ghost_db_images[g.image_id]
            if db_img.phash:
                try:
                    hash_bytes = bytes.fromhex(db_img.phash)
                    ghost_hashes[g.id] = (
                        cv2.Mat(hash_bytes)
                        if hasattr(cv2, "Mat")
                        else np.frombuffer(hash_bytes, dtype=np.uint8)
                    )
                except Exception:
                    pass

    if not ghost_hashes:
        return

    for idx_o, orphan in enumerate(task_orphans):
        if not orphan.path or not os.path.exists(orphan.path):
            continue
        try:
            img = load_image(Path(orphan.path))
            if img is None:
                continue
            orphan_hash = hasher.compute(img)
            best_ghost_id = None
            best_dist = 999
            for g_issue_id, g_hash in ghost_hashes.items():
                dist = hasher.compare(orphan_hash, g_hash)
                if dist < best_dist and dist <= PHASH_MATCH_MAX_DISTANCE:
                    best_dist = dist
                    best_ghost_id = g_issue_id

            if best_ghost_id:
                orphan.match_issue_id = best_ghost_id
        except Exception:
            pass

        if idx_o % 10 == 0:
            await asyncio.sleep(0)
        if idx_o % 50 == 0:
            await tasks.update_task(
                db,
                task_id,
                status=f"Matching Visual Hashes ({idx_o}/{len(task_orphans)})...",
            )
            logger.info(
                "Audit: Matching hashes progress",
                processed=idx_o,
                total=len(task_orphans),
            )

    await db.flush()


async def _backfill_missing_metadata(
    db: AsyncSession,
    task_id: str,
    all_images: list[Image],
    ghosts: list[AuditIssue],
    corrupted_images: list[AuditIssue],
) -> int:
    """Backfill missing phash, dimensions, filesize, color, and aspect ratios."""
    h_ratio_setting = await get_setting(db, "horizontal_target_ratio")
    v_ratio_setting = await get_setting(db, "vertical_target_ratio")
    h_label = (
        h_ratio_setting.value.replace("/", "x")
        if h_ratio_setting and h_ratio_setting.value
        else "16x9"
    )
    v_label = (
        v_ratio_setting.value.replace("/", "x")
        if v_ratio_setting and v_ratio_setting.value
        else "9x16"
    )

    ghost_ids = {g.image_id for g in ghosts if g.image_id}
    corrupted_ids = {c.image_id for c in corrupted_images if c.image_id}
    skip_ids = ghost_ids.union(corrupted_ids)

    missing_metadata_imgs = [
        img
        for img in all_images
        if img.id not in skip_ids
        and img.local_path
        and (
            not img.phash
            or img.width is None
            or img.height is None
            or img.file_size is None
            or not img.dominant_color
            or not img.aspect_ratio_label
            or (
                img.width is not None
                and img.height is not None
                and (
                    (img.aspect_ratio_label == h_label and img.width < img.height)
                    or (img.aspect_ratio_label == v_label and img.width >= img.height)
                )
            )
        )
    ]

    hasher = cv2.img_hash.PHash_create()
    updated_count = 0

    for idx, img in enumerate(missing_metadata_imgs, start=1):
        p = Path(img.local_path)
        if not p.exists():
            continue
        try:
            cv_img = load_image(p)
            if cv_img is None:
                continue

            h, w = cv_img.shape[:2]
            img.width = w
            img.height = h
            img.aspect_ratio_label = h_label if w >= h else v_label
            img.file_size = p.stat().st_size
            img.phash = hasher.compute(cv_img).tobytes().hex()
            img.dominant_color = calculate_dominant_color(p)
            updated_count += 1
        except Exception:
            pass

        if idx % 10 == 0:
            await asyncio.sleep(0)

        if idx % 50 == 0:
            await tasks.update_task(
                db,
                task_id,
                progress=90 + int((idx / max(len(missing_metadata_imgs), 1)) * 10),
                status=f"Backfilling metadata ({idx}/{len(missing_metadata_imgs)})...",
            )

    if missing_metadata_imgs:
        await db.flush()

    return updated_count


async def run_library_audit(
    vault_roots_input: Optional[str | list[str]] = None, task_id: str = ""
) -> None:
    """Run full library integrity audit pipeline across database and filesystem."""
    async with SessionLocal() as db:
        try:
            await tasks.update_task(
                db, task_id, status=TaskStatus.PROCESSING, progress=0, total=100
            )

            vault_roots = await resolve_all_vault_roots(db, vault_roots_input)

            # 1. Clear old pending issues for this task
            await db.execute(delete(AuditIssue).where(AuditIssue.task_id == task_id))

            # 2. Ghost hunt and corrupted image detection
            await tasks.update_task(
                db, task_id, progress=5, total=100, status="Scanning Database..."
            )
            res = await db.execute(select(Image).options(selectinload(Image.set)))
            all_images = list(res.scalars().all())

            ghosts, corrupted_images, _mismatches = await _audit_ghosts_and_corrupted(
                db, task_id, all_images
            )

            # 3. Orphan hunt
            await tasks.update_task(
                db, task_id, progress=45, status="Scanning Filesystem..."
            )
            set_res = await db.execute(select(Set))
            all_sets = list(set_res.scalars().all())

            orphans = await _audit_filesystem_orphans(
                db, task_id, vault_roots, all_images, all_sets
            )

            # 4. Set integrity hunt
            await tasks.update_task(
                db, task_id, progress=60, status="Checking Set Integrity..."
            )
            await _audit_set_integrity(db, task_id, all_sets, all_images)

            # 5. Orphan DB records hunt
            await tasks.update_task(
                db, task_id, progress=68, status="Checking Database Orphans..."
            )
            await _audit_orphan_db_records(db, task_id)

            # 6. Duplicate entries hunt
            await tasks.update_task(
                db, task_id, progress=75, status="Checking Database Integrity..."
            )
            await _audit_duplicate_paths(db, task_id, all_images)

            # 7. Perceptual hash matching
            await tasks.update_task(
                db, task_id, progress=85, status="Matching Visual Hashes..."
            )
            await _match_visual_hashes(db, task_id)

            # 8. Metadata backfill
            await tasks.update_task(
                db, task_id, progress=90, status="Backfilling missing metadata..."
            )
            updated_count = await _backfill_missing_metadata(
                db, task_id, all_images, ghosts, corrupted_images
            )

            await db.commit()
            await tasks.update_task(
                db, task_id, progress=100, status=TaskStatus.COMPLETED
            )
            logger.info(
                "Audit Complete",
                ghosts_found=len(ghosts),
                orphans_found=len(orphans),
                metadata_backfilled=updated_count,
            )

        except Exception as e:
            logger.exception("Error running library audit", error=str(e))
            try:
                await db.rollback()
                await tasks.update_task(
                    db, task_id, status=TaskStatus.ERROR, error_message=str(e)
                )
            except Exception as rollback_err:
                logger.error(
                    "Failed to update task error status on session rollback",
                    error=str(rollback_err),
                )
                async with SessionLocal() as fresh_db:
                    await tasks.update_task(
                        fresh_db, task_id, status=TaskStatus.ERROR, error_message=str(e)
                    )
