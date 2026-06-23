"""
Service for library auditing and health checks.
Provides functionality for finding ghost files, orphaned files, and matching visual hashes.
"""

from typing import Optional
import os
from pathlib import Path
from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload

from app.models.image import Image
from app.models.set import Set
from app.models.audit import AuditIssue
from app.db.session import SessionLocal
from app.core import tasks
from app.core.enums import TaskStatus, AuditIssueType
from app.core.crop import load_image
import structlog
import cv2
import numpy as np

logger = structlog.get_logger(__name__)


def calculate_phash(path: Path) -> Optional[str]:
    try:
        img = load_image(path)
        if img is None:
            return None
        hasher = cv2.img_hash.PHash_create()
        return hasher.compute(img).tobytes().hex()
    except Exception:
        return None


def calculate_dominant_color(path: Path) -> Optional[str]:
    try:
        img = load_image(path)
        if img is None:
            return None

        img = cv2.resize(img, (50, 50))
        data = img.reshape((-1, 3))
        data = np.float32(data)

        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
        flags = cv2.KMEANS_RANDOM_CENTERS
        compactness, labels, centers = cv2.kmeans(data, 3, None, criteria, 10, flags)

        unique, counts = np.unique(labels, return_counts=True)
        dominant_label = unique[np.argmax(counts)]
        dominant_center = centers[dominant_label]

        b, g, r = (
            int(dominant_center[0]),
            int(dominant_center[1]),
            int(dominant_center[2]),
        )
        return f"#{r:02x}{g:02x}{b:02x}".upper()
    except Exception as e:
        logger.error("Error calculating dominant color", error=str(e))
        return None


async def run_library_audit(vault_root_str: str, task_id: str) -> None:
    async with SessionLocal() as db:
        try:
            await tasks.update_task(
                db, task_id, status=TaskStatus.PROCESSING, progress=0, total=100
            )
            vault_root = Path(vault_root_str)

            # 1. Clear old pending issues for this task (if any)
            await db.execute(delete(AuditIssue).where(AuditIssue.task_id == task_id))

            # 2. GHOST HUNT (DB -> Disk) & CORRUPTED IMAGE DETECTION & PATH MISMATCH
            logger.info("Audit: Starting Ghost Hunt...")
            total_images = (await db.execute(select(func.count(Image.id)))).scalar()
            await tasks.update_task(
                db, task_id, progress=5, total=100, status="Scanning Database..."
            )
            logger.info(
                "Audit: Scanning database images for ghosts and corruption",
                total=total_images,
            )

            # Query all images with set context
            img_result = await db.execute(
                select(Image).options(selectinload(Image.set))
            )
            all_images = img_result.scalars().all()

            ghosts = []
            corrupted_images = []
            path_mismatches = []

            for idx, img in enumerate(all_images):
                if not img.local_path or not os.path.exists(img.local_path):
                    ghosts.append(
                        AuditIssue(
                            task_id=task_id,
                            issue_type=AuditIssueType.GHOST,
                            path=img.local_path or "UNKNOWN",
                            directory=str(Path(img.local_path).parent)
                            if img.local_path
                            else "UNKNOWN",
                            image_id=img.id,
                            set_id=img.set_id,
                            expected_phash=img.phash,
                        )
                    )
                else:
                    # File exists. Check if it's corrupted
                    p = Path(img.local_path)
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

                    # Check for path mismatch
                    if img.set and img.set.local_path:
                        expected_dir = os.path.normcase(
                            os.path.normpath(img.set.local_path)
                        )
                        actual_dir = os.path.normcase(os.path.normpath(str(p.parent)))
                        if expected_dir != actual_dir:
                            path_mismatches.append(
                                AuditIssue(
                                    task_id=task_id,
                                    issue_type=AuditIssueType.PATH_MISMATCH,
                                    path=img.local_path,
                                    directory=str(p.parent),
                                    image_id=img.id,
                                    set_id=img.set_id,
                                )
                            )

                if idx % 100 == 0:
                    prog = 5 + int((idx / total_images) * 40) if total_images > 0 else 5
                    await tasks.update_task(
                        db,
                        task_id,
                        progress=prog,
                        status=f"Scanning Database ({idx}/{total_images})...",
                    )
                    logger.info(
                        "Audit: Ghost Hunt progress", scanned=idx, total=total_images
                    )

            if ghosts:
                db.add_all(ghosts)
            if corrupted_images:
                db.add_all(corrupted_images)
            if path_mismatches:
                db.add_all(path_mismatches)

            await db.flush()

            # 3. ORPHAN HUNT (Disk -> DB)
            logger.info("Audit: Starting Orphan Hunt...", vault_root=str(vault_root))
            await tasks.update_task(
                db, task_id, progress=45, status="Scanning Filesystem..."
            )

            image_exts = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"}
            all_db_paths = set()
            for img in all_images:
                if img.local_path:
                    all_db_paths.add(os.path.normcase(os.path.normpath(img.local_path)))

            # Cache sets for fast directory lookup
            set_res = await db.execute(select(Set))
            all_sets = set_res.scalars().all()
            set_dir_map = {
                os.path.normcase(os.path.normpath(s.local_path)): s.id
                for s in all_sets
                if s.local_path
            }

            orphans = []
            files_found = 0
            for r, _, f in os.walk(vault_root):
                dir_path = os.path.normpath(r)
                matching_set_id = set_dir_map.get(os.path.normcase(dir_path))

                for file in f:
                    if Path(file).suffix.lower() in image_exts:
                        full_p = os.path.normpath(os.path.join(r, file))
                        files_found += 1
                        if os.path.normcase(full_p) not in all_db_paths:
                            # Verify if orphan is corrupted
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

                            # Untracked file!
                            orphans.append(
                                AuditIssue(
                                    task_id=task_id,
                                    issue_type=AuditIssueType.ORPHAN,
                                    path=full_p,
                                    directory=dir_path,
                                    set_id=matching_set_id,
                                )
                            )

                if files_found % 100 == 0:
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

            # 3.2. SET INTEGRITY HUNT (Empty Sets & Ghost Sets)
            logger.info("Audit: Checking Set Integrity...", total_sets=len(all_sets))
            await tasks.update_task(
                db, task_id, progress=60, status="Checking Set Integrity..."
            )

            # Count images per set
            set_image_counts = {}
            for img in all_images:
                if img.set_id:
                    set_image_counts[img.set_id] = (
                        set_image_counts.get(img.set_id, 0) + 1
                    )

            set_issues = []
            for s in all_sets:
                # 1. Ghost Set
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
                # 2. Empty Set
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

            # 3.4. ORPHAN DB RECORDS HUNT (Tags, Creators, Characters)
            logger.info(
                "Audit: Checking Database Orphans (unused tags, creators, characters)..."
            )
            await tasks.update_task(
                db, task_id, progress=68, status="Checking Database Orphans..."
            )

            orphan_db_issues = []

            # Orphan Tags
            from app.models.tag import Tag

            tag_res = await db.execute(
                select(Tag).filter(~Tag.images.any(), ~Tag.sets.any())
            )
            for t in tag_res.scalars().all():
                orphan_db_issues.append(
                    AuditIssue(
                        task_id=task_id,
                        issue_type=AuditIssueType.ORPHAN_TAG,
                        path=f"{t.name}:{t.id}",
                        directory="tag",
                    )
                )

            # Orphan Creators
            from app.models.creator import Creator

            creator_res = await db.execute(select(Creator).filter(~Creator.sets.any()))
            for cr in creator_res.scalars().all():
                orphan_db_issues.append(
                    AuditIssue(
                        task_id=task_id,
                        issue_type=AuditIssueType.ORPHAN_CREATOR,
                        path=f"{cr.canonical_name}:{cr.id}",
                        directory="creator",
                    )
                )

            # Orphan Characters
            from app.models.character import Character

            char_res = await db.execute(select(Character).filter(~Character.sets.any()))
            for ch in char_res.scalars().all():
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

            # 3.5. DUPLICATE ENTRIES HUNT
            logger.info(
                "Audit: Checking for Duplicate DB Entries...",
                total_images=len(all_images),
            )
            await tasks.update_task(
                db, task_id, progress=75, status="Checking Database Integrity..."
            )

            from collections import defaultdict

            path_map = defaultdict(list)
            for img in all_images:
                if img.local_path:
                    norm_p = os.path.normcase(os.path.normpath(img.local_path))
                    path_map[norm_p].append(img)

            duplicate_issues = []
            for path, imgs in path_map.items():
                if len(imgs) > 1:
                    # Keep oldest (lowest id), flag the rest
                    imgs.sort(key=lambda x: x.id)
                    for redundant_img in imgs[1:]:
                        duplicate_issues.append(
                            AuditIssue(
                                task_id=task_id,
                                issue_type=AuditIssueType.DUPLICATE_ENTRY,
                                path=path,
                                directory=path,  # store shared path here to group in UI
                                image_id=redundant_img.id,
                                set_id=redundant_img.set_id,
                            )
                        )

            if duplicate_issues:
                db.add_all(duplicate_issues)
                await db.flush()

            # 4. PHASH MATCHING (The Safeguard)
            logger.info("Audit: Performing Visual Matching...")
            await tasks.update_task(
                db, task_id, progress=85, status="Matching Visual Hashes..."
            )

            # Load ghosts and orphans we just found
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

            if task_ghosts and task_orphans:
                logger.info(
                    "Audit: Performing visual matching",
                    ghosts_count=len(task_ghosts),
                    orphans_count=len(task_orphans),
                )
                # Map ghosts by phash
                ghost_map = {
                    g.expected_phash: g for g in task_ghosts if g.expected_phash
                }

                for idx_o, o in enumerate(task_orphans):
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
                    # Calculate phash for orphans on the fly for matching
                    ph = calculate_phash(Path(o.path))
                    if ph:
                        o.found_phash = ph
                        if ph in ghost_map:
                            match = ghost_map[ph]
                            o.match_issue_id = match.id
                            match.match_issue_id = o.id
                            db.add(o)
                            db.add(match)
            else:
                logger.info(
                    "Audit: Skipping visual matching (no ghosts or orphans to match)"
                )

            # 5. METADATA BACKFILL & ASPECT RATIO AUTO-CORRECTION
            logger.info(
                "Audit: Starting Metadata Backfill & Aspect Ratio Auto-Correction..."
            )
            await tasks.update_task(
                db, task_id, progress=90, status="Backfilling missing metadata..."
            )

            from app.crud.settings import get_setting

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

            # Exclude ghosts and corrupted images from backfill
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
                    or
                    # Add check for wrong aspect ratio labels to correct them
                    (
                        img.width is not None
                        and img.height is not None
                        and (
                            (
                                img.aspect_ratio_label == h_label
                                and img.width < img.height
                            )
                            or (
                                img.aspect_ratio_label == v_label
                                and img.width >= img.height
                            )
                        )
                    )
                )
            ]
            logger.info(
                "Audit: Backfilling missing metadata...",
                total_missing=len(missing_metadata_imgs),
            )

            updated_meta_count = 0
            for idx, img in enumerate(missing_metadata_imgs):
                p = Path(img.local_path)
                if p.exists():
                    updated = False

                    if not img.phash:
                        ph = calculate_phash(p)
                        if ph:
                            img.phash = ph
                            updated = True

                    if img.width is None or img.height is None:
                        img_cv = load_image(p)
                        if img_cv is not None:
                            height, width = img_cv.shape[:2]
                            img.width = width
                            img.height = height
                            img.aspect_ratio = (
                                float(width) / float(height) if height != 0 else 0
                            )
                            img.aspect_ratio_label = (
                                h_label if width >= height else v_label
                            )
                            updated = True
                    else:
                        # Dimensions are available, check if ratio label matches actual dimensions and correct it
                        expected_label = h_label if img.width >= img.height else v_label
                        if img.aspect_ratio_label != expected_label:
                            img.aspect_ratio_label = expected_label
                            updated = True

                    if img.file_size is None:
                        img.file_size = p.stat().st_size
                        updated = True

                    if not img.dominant_color:
                        dc = calculate_dominant_color(p)
                        if dc:
                            img.dominant_color = dc
                            updated = True

                    if updated:
                        db.add(img)
                        updated_meta_count += 1

                if idx % 10 == 0 and len(missing_metadata_imgs) > 0:
                    prog = 90 + int((idx / len(missing_metadata_imgs)) * 8)
                    await tasks.update_task(
                        db,
                        task_id,
                        progress=prog,
                        status=f"Backfilling metadata ({idx}/{len(missing_metadata_imgs)})...",
                    )
                    logger.info(
                        "Audit: Metadata backfill progress",
                        processed=idx,
                        total=len(missing_metadata_imgs),
                    )

            if missing_metadata_imgs:
                await db.flush()

            await db.commit()
            await tasks.update_task(
                db, task_id, progress=100, status=TaskStatus.COMPLETED
            )
            logger.info(
                "Audit Complete",
                ghosts_found=len(ghosts),
                orphans_found=len(orphans),
                metadata_backfilled=updated_meta_count,
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
