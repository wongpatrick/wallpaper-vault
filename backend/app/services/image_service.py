"""
Service layer for image operations.

Handles business logic, image processing (phash, colors, sizing), and file system
operations related to individual images.
"""
import anyio
import structlog
from pathlib import Path
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.image import Image
from app.schemas.image import ImageCreate, ImageBulkMove
from app.crud import image as crud_image
from app.core.exceptions import FileSystemError, ResourceNotFoundError, DuplicateResourceError
from app.services.audit_service import calculate_phash, calculate_dominant_color
from app.core.crop import load_image
from app.crud.settings import get_setting

logger = structlog.get_logger(__name__)

async def create_image(db: AsyncSession, image_in: ImageCreate, set_id: int) -> Image:
    """Processes image file (if any) and delegates creation to CRUD."""
    existing = await db.execute(select(Image).where(Image.local_path == image_in.local_path))
    if existing.first():
        raise DuplicateResourceError("Image with this file path already exists in the database.")
        
    image_data = image_in.model_dump()
    if image_data.get("local_path"):
        p = anyio.Path(image_data["local_path"])
        p_lib = Path(image_data["local_path"])
        if await p.exists():
            if not image_data.get("phash"):
                image_data["phash"] = await anyio.to_thread.run_sync(calculate_phash, p_lib)
                
            stat = await p.stat()
            image_data["file_size"] = stat.st_size
            
            if not image_data.get("dominant_color"):
                image_data["dominant_color"] = await anyio.to_thread.run_sync(calculate_dominant_color, p_lib)
                
            if image_data.get("width") is None or image_data.get("height") is None:
                h_ratio_setting = await get_setting(db, "horizontal_target_ratio")
                v_ratio_setting = await get_setting(db, "vertical_target_ratio")
                h_label = h_ratio_setting.value.replace("/", "x") if h_ratio_setting and h_ratio_setting.value else "16x9"
                v_label = v_ratio_setting.value.replace("/", "x") if v_ratio_setting and v_ratio_setting.value else "9x16"
                
                img_cv = await anyio.to_thread.run_sync(load_image, image_data["local_path"])
                if img_cv is not None:
                    height, width = img_cv.shape[:2]
                    image_data["width"] = width
                    image_data["height"] = height
                    image_data["aspect_ratio"] = float(width) / float(height) if height != 0 else 0
                    
                    if not image_data.get("aspect_ratio_label"):
                        image_data["aspect_ratio_label"] = h_label if width >= height else v_label
                        
    # Pass the processed dictionary back into the schema to create in CRUD
    processed_image_in = ImageCreate(**image_data)
    return await crud_image.create_image_db(db, processed_image_in, set_id)

async def delete_image(db: AsyncSession, image_id: int) -> Optional[Image]:
    """Deletes an image from the database and removes its file from disk if no other references exist."""
    db_image = await crud_image.get_image(db, image_id)
    if db_image:
        if db_image.local_path:
            other_refs_query = select(Image.id).where(
                Image.local_path == db_image.local_path,
                Image.id != image_id
            ).limit(1)
            other_refs_result = await db.execute(other_refs_query)
            has_other_refs = other_refs_result.first() is not None

            if not has_other_refs:
                p = anyio.Path(db_image.local_path)
                if await p.exists():
                    try:
                        await p.unlink()
                    except Exception as e:
                        logger.error("Failed to delete image file", path=db_image.local_path, error=str(e))
                        
        return await crud_image.delete_image_db(db, image_id)
    return None

async def resolve_duplicates(db: AsyncSession, keep_id: int, remove_ids: List[int]) -> dict:
    """Resolves a group of duplicates by keeping one image and deleting the rest."""
    keep_img = await crud_image.get_image(db, keep_id)
    if not keep_img:
        raise ResourceNotFoundError("Keep image not found")

    removed_count = 0
    space_saved = 0

    import os
    for rid in remove_ids:
        db_image = await crud_image.get_image(db, rid)
        if db_image:
            file_deleted = False
            
            if not db_image.local_path:
                file_deleted = True
            else:
                p = anyio.Path(db_image.local_path)
                
                other_refs_query = select(Image.id).where(
                    Image.local_path == db_image.local_path,
                    Image.id.notin_(remove_ids)
                ).limit(1)
                other_refs_result = await db.execute(other_refs_query)
                has_other_refs = other_refs_result.first() is not None

                if not has_other_refs and await p.exists():
                    stat = await p.stat()
                    file_size = stat.st_size
                    try:
                        await anyio.to_thread.run_sync(os.unlink, db_image.local_path)
                        space_saved += file_size
                        file_deleted = True
                    except Exception as e:
                        logger.error("Error deleting file", path=db_image.local_path, error=str(e), exc_info=True)
                else:
                    file_deleted = True
            
            if file_deleted:
                await crud_image.delete_image_db(db, rid)
                removed_count += 1
    
    return removed_count, space_saved

async def bulk_move_images(db: AsyncSession, move_in: ImageBulkMove) -> int:
    """Moves images from their current sets to a target set, both on disk and in DB."""
    import shutil
    from app.crud.set import get_set
    
    target_set = await get_set(db, move_in.target_set_id)
    if not target_set:
        raise ResourceNotFoundError("Target set not found")
        
    target_path = anyio.Path(target_set.local_path) if target_set.local_path else None
    if target_path and not await target_path.exists():
        await target_path.mkdir(parents=True, exist_ok=True)
        
    result = await db.execute(
        select(Image).where(Image.id.in_(move_in.image_ids))
    )
    db_images = result.scalars().all()
    
    if not db_images:
        return 0
        
    moved_count = 0
    for img in db_images:
        if img.set_id == target_set.id:
            continue
            
        old_p = anyio.Path(img.local_path) if img.local_path else None
        
        if target_path and old_p:
            new_p = target_path / old_p.name
            
            if await old_p.exists() and old_p.parent != target_path:
                counter = 1
                actual_new_p = new_p
                while await actual_new_p.exists():
                    actual_new_p = target_path / f"{old_p.stem}_{counter}{old_p.suffix}"
                    counter += 1
                
                try:
                    await anyio.to_thread.run_sync(shutil.move, str(old_p), str(actual_new_p))
                    img.local_path = str(actual_new_p)
                except Exception as e:
                    logger.error("Error moving image", path=str(old_p), error=str(e), exc_info=True)
                    continue
            elif await new_p.exists():
                img.local_path = str(new_p)
                
        img.set_id = target_set.id
        db.add(img)
        moved_count += 1
        
    await db.commit()
    return moved_count
