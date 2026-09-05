"""
Filesystem and directory management for Sets.
Handles folder renaming, collision resolution, thumbnail verification, and directory resync.
"""

import hashlib
import os
from pathlib import Path
import shutil
import sys
from typing import Optional
import anyio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.core.aspect_ratio import get_aspect_ratio_labels
from app.core.constants import THUMBS_DIR
from app.core.crop import load_image
from app.core.enums import ImageRating
from app.core.exceptions import FileSystemError
from app.core.image_analysis import calculate_dominant_color, calculate_phash
from app.core.utils import sanitize_filename
from app.crud import set as crud_set
from app.models.image import Image
from app.models.set import Set

logger = structlog.get_logger(__name__)


async def rename_set_folder_if_needed(
    db: AsyncSession, db_set: Set, raise_errors: bool = False
) -> None:
    """Checks and renames a set's physical folder to match convention using anyio."""
    if not db_set.local_path:
        return

    creator_names = [
        sanitize_filename(c.canonical_name) for c in db_set.creators
    ]
    creators_str = " & ".join(creator_names) if creator_names else "Unknown"
    sanitized_title = (
        sanitize_filename(db_set.title) if db_set.title else "Untitled"
    )
    new_folder_name = f"{creators_str} - {sanitized_title}"

    old_path = anyio.Path(db_set.local_path)
    new_path = old_path.with_name(new_folder_name)

    if new_path == old_path:
        try:
            if not await old_path.exists():
                await old_path.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            logger.error("Error creating directory", error=str(e), exc_info=True)
            if raise_errors:
                raise FileSystemError(
                    f"Failed to create directory for set '{db_set.title}': {str(e)}"
                ) from e
        return

    sep = "\\" if sys.platform == "win32" else "/"

    try:
        result = await db.execute(
            select(Image).where(Image.set_id == db_set.id)
        )
        images = list(result.scalars().all())
        image_by_filename = {img.filename: img for img in images}

        if await old_path.exists() and await old_path.is_dir():
            if not await new_path.exists():
                await old_path.rename(new_path)
                db_set.local_path = str(new_path)
                for img in images:
                    img.local_path = str(new_path) + sep + img.filename
            else:

                def merge_and_update_db():
                    src_p = Path(db_set.local_path)
                    dest_p = Path(str(new_path))

                    def get_file_hash(file_path: Path) -> str:
                        hasher = hashlib.sha256()
                        with open(file_path, "rb") as f:
                            for chunk in iter(lambda: f.read(65536), b""):
                                hasher.update(chunk)
                        return hasher.hexdigest()

                    for item in src_p.iterdir():
                        if item.is_dir():
                            shutil.move(str(item), str(dest_p / item.name))
                        else:
                            filename = item.name
                            dest_item = dest_p / filename

                            db_img = image_by_filename.get(filename)

                            if dest_item.exists():
                                if (
                                    item.stat().st_size
                                    == dest_item.stat().st_size
                                    and get_file_hash(item)
                                    == get_file_hash(dest_item)
                                ):
                                    item.unlink()
                                    if db_img:
                                        db_img.local_path = str(dest_item)
                                else:
                                    counter = 1
                                    stem = item.stem
                                    suffix = item.suffix
                                    while True:
                                        new_filename = (
                                            f"{stem}_{counter}{suffix}"
                                        )
                                        candidate = dest_p / new_filename
                                        if not candidate.exists():
                                            shutil.move(
                                                str(item), str(candidate)
                                            )
                                            if db_img:
                                                db_img.filename = new_filename
                                                db_img.local_path = str(
                                                    candidate
                                                )
                                            break
                                        counter += 1
                            else:
                                shutil.move(str(item), str(dest_item))
                                if db_img:
                                    db_img.local_path = str(dest_item)
                    try:
                        src_p.rmdir()
                    except OSError:
                        pass

                await anyio.to_thread.run_sync(merge_and_update_db)
                db_set.local_path = str(new_path)
        else:
            await new_path.mkdir(parents=True, exist_ok=True)
            db_set.local_path = str(new_path)
            for img in images:
                img.local_path = str(new_path) + sep + img.filename

    except Exception as e:
        logger.error(
            "Error updating set folder and paths", error=str(e), exc_info=True
        )
        if raise_errors:
            raise FileSystemError(
                f"Failed to update folder or paths for set '{db_set.title}': {str(e)}"
            ) from e


def check_and_clear_stale_thumbnails(
    images: list[dict], thumbs_dir: Path
) -> None:
    """Check modification times of original images vs thumbnails and delete stale thumbnails."""
    for img in images:
        img_id = img["id"]
        local_path = img["local_path"]
        if not local_path or not os.path.exists(local_path):
            continue
        try:
            orig_mtime = os.path.getmtime(local_path)
            for size in ["sm", "md", "lg"]:
                thumb_path = thumbs_dir / f"{img_id}_{size}.jpg"
                if thumb_path.exists():
                    thumb_mtime = os.path.getmtime(thumb_path)
                    if orig_mtime > thumb_mtime:
                        logger.info(
                            "Deleting stale cached thumbnail due to newer original image",
                            image_id=img_id,
                            size=size,
                            path=str(thumb_path),
                        )
                        thumb_path.unlink()
        except Exception as e:
            logger.warning(
                "Error checking thumbnail modification time",
                image_id=img_id,
                error=str(e),
            )


async def resync_set(db: AsyncSession, set_id: int) -> Optional[Set]:
    """Resynchronize a set with its physical filesystem folder."""
    db_set = await crud_set.get_set(db, set_id)
    if not db_set or not db_set.local_path:
        return None

    images_info = [
        {"id": img.id, "local_path": img.local_path}
        for img in db_set.images
        if img.id and img.local_path
    ]
    if images_info:
        await anyio.to_thread.run_sync(
            check_and_clear_stale_thumbnails, images_info, THUMBS_DIR
        )

    folder_path = anyio.Path(db_set.local_path)
    if not await folder_path.exists() or not await folder_path.is_dir():
        return None

    image_exts = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"}

    disk_files = {}
    async for file in folder_path.iterdir():
        if await file.is_file() and file.suffix.lower() in image_exts:
            disk_files[str(file)] = None

    db_images = {img.local_path: img for img in db_set.images if img.local_path}

    untracked_paths = [p for p in disk_files if p not in db_images]
    missing_records = [
        img for p, img in db_images.items() if not await anyio.Path(p).exists()
    ]

    if untracked_paths and missing_records:
        ghost_map = {}
        for ghost in missing_records:
            if ghost.phash:
                if ghost.phash not in ghost_map:
                    ghost_map[ghost.phash] = []
                ghost_map[ghost.phash].append(ghost)

        recovered_paths = set()
        recovered_records = set()

        for path_str in untracked_paths:
            ph = await anyio.to_thread.run_sync(calculate_phash, Path(path_str))
            if ph and ph in ghost_map:
                possible_ghosts = [
                    g for g in ghost_map[ph] if g not in recovered_records
                ]
                if possible_ghosts:
                    ghost = possible_ghosts[0]
                    ghost.local_path = path_str
                    recovered_paths.add(path_str)
                    recovered_records.add(ghost)

        untracked_paths = [
            p for p in untracked_paths if p not in recovered_paths
        ]
        missing_records = [
            g for g in missing_records if g not in recovered_records
        ]

    if untracked_paths:
        existing_res = await db.execute(
            select(Image.local_path).where(
                Image.local_path.in_(untracked_paths)
            )
        )
        globally_tracked = set(existing_res.scalars().all())
        untracked_paths = [
            p for p in untracked_paths if p not in globally_tracked
        ]

    default_rating = ImageRating.QUESTIONABLE
    h_label, v_label = await get_aspect_ratio_labels(db)

    for path_str in untracked_paths:
        p = anyio.Path(path_str)
        p_lib = Path(path_str)
        ph = await anyio.to_thread.run_sync(calculate_phash, p_lib)

        img_cv = await anyio.to_thread.run_sync(load_image, path_str)
        w, h, ar, ratio_label = None, None, None, None
        if img_cv is not None:
            height, width = img_cv.shape[:2]
            w, h = width, height
            ar = float(w) / float(h) if h != 0 else 0
            ratio_label = h_label if w >= h else v_label

        stat = await p.stat()
        file_size = stat.st_size
        dominant_color = await anyio.to_thread.run_sync(
            calculate_dominant_color, p_lib
        )

        new_img = Image(
            set_id=set_id,
            filename=p.name,
            local_path=path_str,
            phash=ph,
            rating=default_rating,
            width=w,
            height=h,
            aspect_ratio=ar,
            aspect_ratio_label=ratio_label,
            file_size=file_size,
            dominant_color=dominant_color,
        )
        db.add(new_img)

    for ghost in missing_records:
        await db.delete(ghost)

    await db.commit()
    await db.refresh(db_set)
    return await crud_set.get_set(db, set_id)
