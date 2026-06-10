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
        
        b, g, r = int(dominant_center[0]), int(dominant_center[1]), int(dominant_center[2])
        return f"#{r:02x}{g:02x}{b:02x}".upper()
    except Exception as e:
        logger.error("Error calculating dominant color", error=str(e))
        return None

async def run_library_audit(vault_root_str: str, task_id: str) -> None:
    async with SessionLocal() as db:
        try:
            await tasks.update_task(db, task_id, status=TaskStatus.PROCESSING, progress=0, total=100)
            vault_root = Path(vault_root_str)
            
            # 1. Clear old pending issues for this task (if any)
            await db.execute(delete(AuditIssue).where(AuditIssue.task_id == task_id))
            
            # 2. GHOST HUNT (DB -> Disk)
            logger.info("Audit: Starting Ghost Hunt...")
            total_images = (await db.execute(select(func.count(Image.id)))).scalar()
            await tasks.update_task(db, task_id, progress=5, total=100, status="Scanning Database...")
            
            # Query all images with set context
            img_result = await db.execute(
                select(Image).options(selectinload(Image.set))
            )
            all_images = img_result.scalars().all()
            
            ghosts = []
            for idx, img in enumerate(all_images):
                if not img.local_path or not os.path.exists(img.local_path):
                    ghosts.append(AuditIssue(
                        task_id=task_id,
                        issue_type=AuditIssueType.GHOST,
                        path=img.local_path or "UNKNOWN",
                        directory=str(Path(img.local_path).parent) if img.local_path else "UNKNOWN",
                        image_id=img.id,
                        set_id=img.set_id,
                        expected_phash=img.phash
                    ))
                
                if idx % 500 == 0:
                    prog = 5 + int((idx / total_images) * 40) # 5% to 45%
                    await tasks.update_task(db, task_id, progress=prog)
            
            if ghosts:
                db.add_all(ghosts)
                await db.flush()

            # 3. ORPHAN HUNT (Disk -> DB)
            logger.info("Audit: Starting Orphan Hunt...")
            await tasks.update_task(db, task_id, progress=45, status="Scanning Filesystem...")
            
            image_exts = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff'}
            all_db_paths = set()
            for img in all_images:
                if img.local_path:
                    all_db_paths.add(os.path.normpath(img.local_path))
            
            # Cache sets for fast directory lookup
            set_res = await db.execute(select(Set))
            all_sets = set_res.scalars().all()
            set_dir_map = {os.path.normpath(s.local_path): s.id for s in all_sets if s.local_path}

            orphans = []
            files_found = 0
            for r, _, f in os.walk(vault_root):
                dir_path = os.path.normpath(r)
                matching_set_id = set_dir_map.get(dir_path)

                for file in f:
                    if Path(file).suffix.lower() in image_exts:
                        full_p = os.path.normpath(os.path.join(r, file))
                        files_found += 1
                        if full_p not in all_db_paths:
                            # Untracked file!
                            orphans.append(AuditIssue(
                                task_id=task_id,
                                issue_type=AuditIssueType.ORPHAN,
                                path=full_p,
                                directory=dir_path,
                                set_id=matching_set_id
                            ))
                
                if files_found % 500 == 0:
                    await tasks.update_task(db, task_id, status=f"Found {len(orphans)} untracked files...")

            if orphans:
                db.add_all(orphans)
                await db.flush()

            # 3.5. DUPLICATE ENTRIES HUNT
            logger.info("Audit: Checking for Duplicate DB Entries...")
            await tasks.update_task(db, task_id, progress=75, status="Checking Database Integrity...")
            
            from collections import defaultdict
            path_map = defaultdict(list)
            for img in all_images:
                if img.local_path:
                    norm_p = os.path.normpath(img.local_path)
                    path_map[norm_p].append(img)
            
            duplicate_issues = []
            for path, imgs in path_map.items():
                if len(imgs) > 1:
                    # Keep oldest (lowest id), flag the rest
                    imgs.sort(key=lambda x: x.id)
                    for redundant_img in imgs[1:]:
                        duplicate_issues.append(AuditIssue(
                            task_id=task_id,
                            issue_type=AuditIssueType.DUPLICATE_ENTRY,
                            path=path,
                            directory=path,  # store shared path here to group in UI
                            image_id=redundant_img.id,
                            set_id=redundant_img.set_id
                        ))
                        
            if duplicate_issues:
                db.add_all(duplicate_issues)
                await db.flush()

            # 4. PHASH MATCHING (The Safeguard)
            logger.info("Audit: Performing Visual Matching...")
            await tasks.update_task(db, task_id, progress=85, status="Matching Visual Hashes...")
            
            # Load ghosts and orphans we just found
            res = await db.execute(select(AuditIssue).filter(AuditIssue.task_id == task_id))
            found_issues = res.scalars().all()
            
            task_ghosts = [i for i in found_issues if i.issue_type == AuditIssueType.GHOST]
            task_orphans = [i for i in found_issues if i.issue_type == AuditIssueType.ORPHAN]
            
            if task_ghosts and task_orphans:
                # Map ghosts by phash
                ghost_map = {g.expected_phash: g for g in task_ghosts if g.expected_phash}
                
                for o in task_orphans:
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

            # 5. METADATA BACKFILL
            logger.info("Audit: Backfilling missing metadata...")
            await tasks.update_task(db, task_id, progress=90, status="Backfilling missing metadata...")
            
            from app.crud.settings import get_setting
            h_ratio_setting = await get_setting(db, "horizontal_target_ratio")
            v_ratio_setting = await get_setting(db, "vertical_target_ratio")
            h_label = h_ratio_setting.value.replace("/", "x") if h_ratio_setting and h_ratio_setting.value else "16x9"
            v_label = v_ratio_setting.value.replace("/", "x") if v_ratio_setting and v_ratio_setting.value else "9x16"
            
            missing_metadata_imgs = [
                img for img in all_images 
                if img.local_path and (
                    not img.phash or
                    img.width is None or
                    img.height is None or
                    img.file_size is None or
                    not img.dominant_color or
                    not img.aspect_ratio_label
                )
            ]
            
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
                            img.aspect_ratio = float(width) / float(height) if height != 0 else 0
                            img.aspect_ratio_label = h_label if width >= height else v_label
                            updated = True
                    elif not img.aspect_ratio_label:
                        img.aspect_ratio_label = h_label if img.width >= img.height else v_label
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
                        
                if idx % 50 == 0 and len(missing_metadata_imgs) > 0:
                    prog = 90 + int((idx / len(missing_metadata_imgs)) * 8)
                    await tasks.update_task(db, task_id, progress=prog, status=f"Backfilling metadata ({idx}/{len(missing_metadata_imgs)})...")
                    
            if missing_metadata_imgs:
                await db.flush()

            await db.commit()
            await tasks.update_task(db, task_id, progress=100, status=TaskStatus.COMPLETED)
            logger.info("Audit Complete", ghosts_found=len(ghosts), orphans_found=len(orphans), metadata_backfilled=updated_meta_count)

        except Exception as e:
            logger.exception("Error running library audit", error=str(e))
            await tasks.update_task(db, task_id, status=TaskStatus.ERROR, error_message=str(e))
