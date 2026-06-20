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
from app.schemas.image import ImageCreate, ImageBulkMove, ImageCropRequest
from app.crud import image as crud_image
from app.core.exceptions import ResourceNotFoundError, DuplicateResourceError
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


async def crop_image(
    db: AsyncSession,
    image_id: int,
    crop_req: ImageCropRequest
) -> dict:
    """Crops an image based on aspect ratio or custom coordinates.

    Supports preview mode (returns calculated coordinates), saving as a new image,
    or replacing the original image (updates metadata, invalidates thumbnails).
    """
    import cv2
    from pathlib import Path
    import anyio
    from app.core.crop import compute_saliency_map, best_crop_coords, compute_focal_point, save_image
    from app.services.audit_service import calculate_phash, calculate_dominant_color
    from app.crud.settings import get_setting
    from app.crud.image import get_image as crud_get_image
    
    # 1. Fetch original image record
    db_image = await crud_get_image(db, image_id)
    if not db_image:
        raise ResourceNotFoundError(f"Image with ID {image_id} not found")
        
    original_path = Path(db_image.local_path)
    if not original_path.exists():
        raise ResourceNotFoundError(f"Original image file not found on disk: {db_image.local_path}")
        
    # 2. Load original image
    img_data = await anyio.to_thread.run_sync(load_image, original_path)
    if img_data is None:
        raise ValueError("Failed to load original image file")
        
    H, W = img_data.shape[:2]
    
    # 3. Calculate crop coordinates (x, y, crop_w, crop_h)
    has_custom_coords = (
        crop_req.x is not None and 
        crop_req.y is not None and 
        crop_req.width is not None and 
        crop_req.height is not None
    )
    
    if has_custom_coords:
        crop_x = max(0, min(crop_req.x, W - 1))
        crop_y = max(0, min(crop_req.y, H - 1))
        crop_w = max(1, min(crop_req.width, W - crop_x))
        crop_h = max(1, min(crop_req.height, H - crop_y))
    else:
        # Automatic saliency cropping based on target aspect ratio
        aspect_ratio_str = crop_req.aspect_ratio or "16:9"
        try:
            parts = aspect_ratio_str.split(":")
            ar = float(parts[0]) / float(parts[1])
        except Exception:
            ar = 16.0 / 9.0
            
        # Determine internal saliency processing dimensions (matching crop.py)
        downscale_max = 1200
        scale = 1.0
        max_dim = max(W, H)
        if max_dim > downscale_max:
            scale = downscale_max / float(max_dim)
            W_s = int(round(W * scale))
            H_s = int(round(H * scale))
            img_for_sal = cv2.resize(img_data, (W_s, H_s), interpolation=cv2.INTER_AREA)
        else:
            img_for_sal = img_data.copy()
            W_s, H_s = W, H
            
        if W_s / H_s >= ar:
            ch_s = min(H_s, int(round(W_s / ar)))
            cw_s = int(round(ar * ch_s))
        else:
            cw_s = min(W_s, int(round(H_s * ar)))
            ch_s = int(round(cw_s / ar))
            
        cw_s = max(1, min(cw_s, W_s))
        ch_s = max(1, min(ch_s, H_s))
        
        # Saliency map
        img_gray = cv2.cvtColor(img_for_sal, cv2.COLOR_BGR2GRAY)
        sal_map = compute_saliency_map(img_gray)
        x_s, y_s = best_crop_coords(W_s, H_s, cw_s, ch_s, sal_map)
        
        # Scale back to original
        if scale < 1.0:
            inv = 1.0 / scale
            crop_x = int(round(x_s * inv))
            crop_y = int(round(y_s * inv))
            crop_w = int(round(cw_s * inv))
            crop_h = int(round(ch_s * inv))
        else:
            crop_x, crop_y, crop_w, crop_h = x_s, y_s, cw_s, ch_s
            
        crop_x = max(0, min(crop_x, W - crop_w))
        crop_y = max(0, min(crop_y, H - crop_h))
        crop_w = min(crop_w, W - crop_x)
        crop_h = min(crop_h, H - crop_y)
        
    # 4. If preview_only, return coordinates immediately
    if crop_req.preview_only:
        return {
            "x": crop_x,
            "y": crop_y,
            "width": crop_w,
            "height": crop_h,
            "image": None
        }
        
    # 5. Perform the cropping
    cropped_img = img_data[crop_y:crop_y+crop_h, crop_x:crop_x+crop_w]
    
    # Get aspect ratio labels
    h_ratio_setting = await get_setting(db, "horizontal_target_ratio")
    v_ratio_setting = await get_setting(db, "vertical_target_ratio")
    h_label = h_ratio_setting.value.replace("/", "x") if h_ratio_setting and h_ratio_setting.value else "16x9"
    v_label = v_ratio_setting.value.replace("/", "x") if v_ratio_setting and v_ratio_setting.value else "9x16"
    
    # Calculate aspect ratio label for cropped image
    if crop_req.aspect_ratio:
        aspect_ratio_label = crop_req.aspect_ratio.replace(":", "x")
    else:
        aspect_ratio_label = h_label if crop_w >= crop_h else v_label
        
    # 6. Save modes
    if crop_req.save_mode == "replace":
        # Save cropped image back to original path
        ok = await anyio.to_thread.run_sync(save_image, original_path, cropped_img)
        if not ok:
            raise ValueError("Failed to save cropped image to disk")
            
        # Update metadata
        db_image.width = crop_w
        db_image.height = crop_h
        db_image.aspect_ratio = float(crop_w) / float(crop_h) if crop_h != 0 else 0
        db_image.aspect_ratio_label = aspect_ratio_label
        
        stat = await anyio.Path(db_image.local_path).stat()
        db_image.file_size = stat.st_size
        
        # Re-calculate image properties
        db_image.phash = await anyio.to_thread.run_sync(calculate_phash, original_path)
        db_image.dominant_color = await anyio.to_thread.run_sync(calculate_dominant_color, original_path)
        fx, fy = await anyio.to_thread.run_sync(compute_focal_point, cropped_img)
        db_image.focal_point_x = fx
        db_image.focal_point_y = fy
        
        db.add(db_image)
        await db.commit()
        await db.refresh(db_image)
        
        # Invalidate thumbnail cache for this image
        thumbs_dir = Path(__file__).resolve().parent.parent.parent.parent / "db" / "thumbs"
        for size in ["sm", "md", "lg"]:
            thumb_file = thumbs_dir / f"{image_id}_{size}.jpg"
            if thumb_file.exists():
                try:
                    thumb_file.unlink()
                except Exception as e:
                    logger.warning("Failed to delete stale thumbnail", path=str(thumb_file), error=str(e))
                    
        # Refresh relationships
        final_image = await crud_get_image(db, image_id)
        return {
            "x": crop_x,
            "y": crop_y,
            "width": crop_w,
            "height": crop_h,
            "image": final_image
        }
        
    else: # save_mode == "new"
        # Construct unique path in same folder as original
        ext = original_path.suffix.lower()
        if ext not in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}:
            ext = ".png"
            
        MIN_CROP_PARTS = 2
        clean_stem = original_path.stem
        if clean_stem.startswith("crop_"):
            parts = clean_stem.split("_", MIN_CROP_PARTS)
            if len(parts) > MIN_CROP_PARTS:
                clean_stem = parts[MIN_CROP_PARTS]
                
        new_filename = f"crop_{aspect_ratio_label}_{clean_stem}{ext}"
        new_path = original_path.parent / new_filename
        
        counter = 1
        while True:
            # Check filesystem
            if new_path.exists():
                new_filename = f"crop_{aspect_ratio_label}_{clean_stem}_{counter}{ext}"
                new_path = original_path.parent / new_filename
                counter += 1
                continue
                
            # Check database unique constraint
            from sqlalchemy import select
            db_exists = await db.execute(
                select(Image.id).where(Image.local_path == str(new_path.resolve())).limit(1)
            )
            if db_exists.first() is not None:
                new_filename = f"crop_{aspect_ratio_label}_{clean_stem}_{counter}{ext}"
                new_path = original_path.parent / new_filename
                counter += 1
                continue
                
            break
            
        # Save cropped image to new path
        ok = await anyio.to_thread.run_sync(save_image, new_path, cropped_img)
        if not ok:
            raise ValueError("Failed to save cropped image to disk")
            
        stat = await anyio.Path(new_path).stat()
        file_size = stat.st_size
        
        phash = await anyio.to_thread.run_sync(calculate_phash, new_path)
        dominant_color = await anyio.to_thread.run_sync(calculate_dominant_color, new_path)
        fx, fy = await anyio.to_thread.run_sync(compute_focal_point, cropped_img)
        
        # Create database entry copying original rating and notes
        new_db_image = Image(
            filename=new_filename,
            local_path=str(new_path.resolve()),
            phash=phash,
            width=crop_w,
            height=crop_h,
            file_size=file_size,
            aspect_ratio=float(crop_w) / float(crop_h) if crop_h != 0 else 0,
            aspect_ratio_label=aspect_ratio_label,
            rating=db_image.rating,
            notes=db_image.notes,
            dominant_color=dominant_color,
            focal_point_x=fx,
            focal_point_y=fy,
            sort_order=(db_image.sort_order or 0) + 1,
            set_id=db_image.set_id
        )
        
        # Copy tags from original image (eagerly loaded)
        if db_image.tags:
            new_db_image.tags = list(db_image.tags)
            
        db.add(new_db_image)
        await db.commit()
        
        final_image = await crud_get_image(db, new_db_image.id)
        return {
            "x": crop_x,
            "y": crop_y,
            "width": crop_w,
            "height": crop_h,
            "image": final_image
        }
