"""
Service for scanning library paths and auto-registering sets and images.
"""
import os
from pathlib import Path
from typing import Optional
import cv2
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.image import Image
from app.models.set import Set
from app.models.creator import Creator
from app.models.library_path import LibraryPath
from app.db.session import SessionLocal
from app.core import tasks
from app.core.enums import TaskStatus, ImageRating
from app.core.crop import load_image
from app.core.aspect_ratio import get_aspect_ratio_labels
from app.core.image_analysis import calculate_dominant_color
from app.core.parsing import parse_set_folder_name
import structlog

logger = structlog.get_logger(__name__)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"}

async def scan_library_path_background_task(library_path_id: int, task_id: str, db: Optional[AsyncSession] = None) -> None:
    """
    Background worker that scans a newly registered library path,
    discovering sets and images, registering them into the database,
    and broadcasting progress via the SSE task system.
    """
    if db is not None:
        await _scan_library_path_impl(db, library_path_id, task_id)
    else:
        async with SessionLocal() as session:
            await _scan_library_path_impl(session, library_path_id, task_id)

async def _scan_library_path_impl(db: AsyncSession, library_path_id: int, task_id: str) -> None:
    try:
        await tasks.update_task(
            db, task_id, status=TaskStatus.PROCESSING, progress=0, total=100
        )

        lp = await db.get(LibraryPath, library_path_id)
        if not lp:
            await tasks.update_task(
                db, task_id, status=TaskStatus.ERROR, error_message=f"Library path {library_path_id} not found"
            )
            return

        root_path = Path(lp.path)
        if not root_path.exists() or not root_path.is_dir():
            await tasks.update_task(
                db, task_id, status=TaskStatus.ERROR, error_message=f"Directory does not exist: {lp.path}"
            )
            return

        logger.info("Starting library path auto-scan", library_path_id=library_path_id, path=lp.path)

        h_label, v_label = await get_aspect_ratio_labels(db)

        # Discover all directories with image files
        candidate_dirs = []
        for dirpath, dirnames, filenames in os.walk(root_path):
            # Count image files
            img_files = [f for f in filenames if Path(f).suffix.lower() in IMAGE_EXTENSIONS]
            if img_files:
                candidate_dirs.append((Path(dirpath), img_files))

        total_dirs = len(candidate_dirs)
        logger.info("Found candidate directories with images", total_dirs=total_dirs)

        if total_dirs == 0:
            await tasks.update_task(
                db, task_id, progress=100, status=TaskStatus.COMPLETED
            )
            return

        sets_created = 0
        images_imported = 0

        for idx, (dir_path, img_files) in enumerate(candidate_dirs):
            norm_dir = os.path.normcase(os.path.normpath(str(dir_path.resolve())))

            # Check if set already exists for this folder
            set_stmt = select(Set).where(Set.local_path == norm_dir).options(
                selectinload(Set.creators),
                selectinload(Set.images)
            )
            res = await db.execute(set_stmt)
            db_set = res.scalars().first()

            if not db_set:
                # Parse folder name
                creator_name, set_title = parse_set_folder_name(dir_path.name)

                # Get or create creator
                creator_stmt = select(Creator).where(Creator.canonical_name == creator_name)
                c_res = await db.execute(creator_stmt)
                creator = c_res.scalars().first()
                if not creator and creator_name != "Unknown":
                    creator = Creator(canonical_name=creator_name)
                    db.add(creator)
                    await db.flush()

                db_set = Set(
                    title=set_title,
                    local_path=norm_dir,
                    library_path_id=library_path_id,
                    creators=[creator] if creator else []
                )
                db.add(db_set)
                await db.flush()
                sets_created += 1
                existing_paths = set()
            else:
                # Update library_path_id if not linked
                if db_set.library_path_id != library_path_id:
                    db_set.library_path_id = library_path_id
                    await db.flush()
                # Get existing images for this set
                existing_paths = {os.path.normcase(os.path.normpath(img.local_path)) for img in db_set.images if img.local_path}

            for filename in img_files:
                full_p = dir_path / filename
                norm_file_path = os.path.normcase(os.path.normpath(str(full_p.resolve())))

                if norm_file_path in existing_paths:
                    continue

                # Check global db duplicate path
                glob_img = await db.execute(select(Image.id).where(Image.local_path == norm_file_path))
                if glob_img.first():
                    continue

                try:
                    img_cv = load_image(full_p)
                    w, h = 0, 0
                    phash = None
                    if img_cv is not None:
                        h, w = img_cv.shape[:2]
                        hasher = cv2.img_hash.PHash_create()
                        phash = hasher.compute(img_cv).tobytes().hex()

                    aspect_label = h_label if w >= h else v_label
                    dc = calculate_dominant_color(full_p)
                    file_size = full_p.stat().st_size if full_p.exists() else 0

                    new_img = Image(
                        set_id=db_set.id,
                        filename=filename,
                        local_path=str(full_p.resolve()),
                        width=w,
                        height=h,
                        file_size=file_size,
                        aspect_ratio=float(w) / float(h) if h != 0 else 0,
                        aspect_ratio_label=aspect_label,
                        phash=phash,
                        dominant_color=dc,
                        rating=ImageRating.QUESTIONABLE
                    )
                    db.add(new_img)
                    existing_paths.add(norm_file_path)
                    images_imported += 1
                except Exception as img_err:
                    logger.warning("Error processing image during library scan", path=str(full_p), error=str(img_err))

            await db.flush()

            prog = int(((idx + 1) / total_dirs) * 95)
            await tasks.update_task(
                db, task_id, progress=prog,
                status=f"Scanning folders ({idx + 1}/{total_dirs}) - {sets_created} sets, {images_imported} images..."
            )

        await db.commit()
        await tasks.update_task(
            db, task_id, progress=100, status=TaskStatus.COMPLETED
        )
        logger.info("Library scan complete", library_path_id=library_path_id, sets_created=sets_created, images_imported=images_imported)

    except Exception as e:
        logger.exception("Error scanning library path", library_path_id=library_path_id, error=str(e))
        try:
            await db.rollback()
            await tasks.update_task(
                db, task_id, status=TaskStatus.ERROR, error_message=str(e)
            )
        except Exception:
            async with SessionLocal() as fresh_db:
                await tasks.update_task(
                    fresh_db, task_id, status=TaskStatus.ERROR, error_message=str(e)
                )
