import os
import asyncio
from pathlib import Path
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, or_
from sqlalchemy.orm import selectinload

from app.models.image import Image
from app.models.set import Set
from app.models.audit import AuditIssue
from app.models.creator import Creator
from app.db.session import SessionLocal
from app.core import tasks
from app.core.crop import load_image
import cv2

def calculate_phash(path: Path):
    try:
        img = load_image(path)
        if img is None: return None
        hasher = cv2.img_hash.PHash_create()
        return hasher.compute(img).tobytes().hex()
    except: return None

async def run_library_audit(vault_root_str: str, task_id: str):
    async with SessionLocal() as db:
        try:
            await tasks.update_task(db, task_id, status="processing", progress=0, total=100)
            vault_root = Path(vault_root_str)
            
            # 1. Clear old pending issues for this task (if any)
            await db.execute(delete(AuditIssue).where(AuditIssue.task_id == task_id))
            
            # 2. GHOST HUNT (DB -> Disk)
            print("Audit: Starting Ghost Hunt...")
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
                        issue_type="ghost",
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
            print("Audit: Starting Orphan Hunt...")
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
                                issue_type="orphan",
                                path=full_p,
                                directory=dir_path,
                                set_id=matching_set_id
                            ))
                
                if files_found % 500 == 0:
                    await tasks.update_task(db, task_id, status=f"Found {len(orphans)} untracked files...")

            if orphans:
                db.add_all(orphans)
                await db.flush()

            # 4. PHASH MATCHING (The Safeguard)
            print("Audit: Performing Visual Matching...")
            await tasks.update_task(db, task_id, progress=85, status="Matching Visual Hashes...")
            
            # Load ghosts and orphans we just found
            res = await db.execute(select(AuditIssue).filter(AuditIssue.task_id == task_id))
            found_issues = res.scalars().all()
            
            task_ghosts = [i for i in found_issues if i.issue_type == "ghost"]
            task_orphans = [i for i in found_issues if i.issue_type == "orphan"]
            
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

            await db.commit()
            await tasks.update_task(db, task_id, progress=100, status="completed")
            print(f"Audit Complete: Found {len(ghosts)} ghosts and {len(orphans)} orphans.")

        except Exception as e:
            import traceback
            traceback.print_exc()
            await tasks.update_task(db, task_id, status="error", error_message=str(e))
