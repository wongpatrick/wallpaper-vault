"""
Service layer for set operations.

Handles business logic, folder renaming, and image processing for wallpaper sets.
Delegates purely database-related operations to the CRUD layer.
"""
from typing import Optional, List
import re
import anyio
import structlog
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession
from app.models.set import Set
from app.models.image import Image
from app.schemas.set import SetCreate, SetImport, SetUpdate, SetBulkUpdate, BatchImportRequest
from app.core.exceptions import FileSystemError, ResourceNotFoundError, DuplicateResourceError
from app.crud import set as crud_set
from app.crud.creator import get_creator_by_name, create_creator
from app.schemas.creator import CreatorCreate

logger = structlog.get_logger(__name__)

def sanitize_folder_name(name: str) -> str:
    """Removes invalid characters from a string to make it safe for directory names."""
    return re.sub(r'[\\/:*?"<>|]', '', name).strip()

async def rename_set_folder_if_needed(db_set: Set, raise_errors: bool = False) -> None:
    """Checks and renames a set's physical folder to match convention using anyio.
    """
    if not db_set.local_path:
        return
        
    creator_names = [c.canonical_name for c in db_set.creators]
    creators_str = " & ".join(creator_names) if creator_names else "Unknown"
    sanitized_title = sanitize_folder_name(db_set.title) if db_set.title else "Untitled"
    new_folder_name = f"{creators_str} - {sanitized_title}"
    
    old_path = anyio.Path(db_set.local_path)
    
    if await old_path.exists() and await old_path.is_dir():
        new_path = old_path.with_name(new_folder_name)
        
        if new_path != old_path and not await new_path.exists():
            try:
                await old_path.rename(new_path)
                db_set.local_path = str(new_path)
                
                if db_set.images:
                    for img in db_set.images:
                        img_old_path = anyio.Path(img.local_path)
                        img_new_path = new_path / img_old_path.name
                        img.local_path = str(img_new_path)
            except Exception as e:
                logger.error("Error renaming set folder", error=str(e), exc_info=True)
                if raise_errors:
                    raise FileSystemError(f"Failed to rename folder for set '{db_set.title}': {str(e)}")

async def create_set(db: AsyncSession, set_in: SetCreate) -> Set:
    """Creates a new Set record and performs necessary file system/image processing."""
    # Move the phash/cv2 logic here from crud.set
    # Actually, we should prepare the image schemas and then pass to CRUD.
    
    import asyncio
    from app.core.crop import load_image
    from app.crud.settings import get_setting
    from app.services.audit_service import calculate_phash, calculate_dominant_color
    
    # ... process image sizes ...
    h_ratio_setting = await get_setting(db, "horizontal_target_ratio")
    v_ratio_setting = await get_setting(db, "vertical_target_ratio")
    h_label = h_ratio_setting.value.replace("/", "x") if h_ratio_setting and h_ratio_setting.value else "16x9"
    v_label = v_ratio_setting.value.replace("/", "x") if v_ratio_setting and v_ratio_setting.value else "9x16"
    
    if set_in.images:
        for image_in in set_in.images:
            if image_in.local_path:
                p = anyio.Path(image_in.local_path)
                if await p.exists():
                    p_lib = Path(image_in.local_path) # for compatibility with existing sync libs
                    
                    if not image_in.phash:
                        image_in.phash = await anyio.to_thread.run_sync(calculate_phash, p_lib)
                        
                    if image_in.width is None or image_in.height is None:
                        img_cv = await anyio.to_thread.run_sync(load_image, str(p))
                        if img_cv is not None:
                            height, width = img_cv.shape[:2]
                            image_in.width = width
                            image_in.height = height
                            image_in.aspect_ratio = float(width) / float(height) if height != 0 else 0
                            
                    if not image_in.aspect_ratio_label:
                        w = image_in.width
                        h = image_in.height
                        if w is not None and h is not None:
                            image_in.aspect_ratio_label = h_label if w >= h else v_label
                            
                    if image_in.file_size is None:
                        stat = await p.stat()
                        image_in.file_size = stat.st_size
                        
                    if image_in.dominant_color is None:
                        image_in.dominant_color = await anyio.to_thread.run_sync(calculate_dominant_color, p_lib)

    db_set = await crud_set.create_set(db, set_in)
    return db_set

async def update_set(db: AsyncSession, set_id: int, set_in: SetUpdate) -> Set:
    db_set = await crud_set.get_set(db, set_id)
    if not db_set:
        raise ResourceNotFoundError("Set not found")
        
    db_set = await crud_set.update_set(db, set_id, set_in)
    await rename_set_folder_if_needed(db_set)
    db.add(db_set)
    await db.commit()
    await db.refresh(db_set)
    return await crud_set.get_set(db, set_id)

async def merge_sets(db: AsyncSession, source_ids: list[int], target_id: int) -> Set:
    import shutil
    import os
    
    target_set = await crud_set.get_set(db, target_id)
    if not target_set:
        raise ResourceNotFoundError("Target set not found")
        
    target_path = anyio.Path(target_set.local_path) if target_set.local_path else None
    
    if target_path and not await target_path.exists():
        try:
            await target_path.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            logger.error("Could not create target directory", path=str(target_path), error=str(e))
            
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
                    logger.error("Could not create adopted target directory", path=str(target_path), error=str(e))
                    
        failed_images = []
        if target_path:
            for img in source_set.images:
                old_p = anyio.Path(img.local_path) if img.local_path else None
                if not old_p:
                    continue
                    
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
                        failed_images.append(img)
                elif await new_p.exists():
                    img.local_path = str(new_p)
                    
        images_to_move = [img for img in source_set.images if img not in failed_images]
        source_set.images = failed_images
        
        for img in images_to_move:
            img.set_id = target_id
            target_set.images.append(img)
            
        for c in source_set.creators:
            if c not in target_set.creators:
                target_set.creators.append(c)
                
        if source_set.tags:
            current_tags = set((target_set.tags or "").split())
            new_tags = set(source_set.tags.split())
            combined = sorted(list(current_tags | new_tags))
            target_set.tags = " ".join(combined) if combined else None
            
        if source_set.notes:
            target_set.notes = (target_set.notes or "") + "\n" + source_set.notes
            target_set.notes = target_set.notes.strip()
            
        source_path = source_set.local_path
        
        if not failed_images:
            await db.delete(source_set)
            
            if source_path and target_path and str(anyio.Path(source_path)) != str(target_path):
                try:
                    await anyio.to_thread.run_sync(os.rmdir, source_path)
                except OSError:
                    pass
                    
    await db.commit()
    await db.refresh(target_set)
    await rename_set_folder_if_needed(target_set)
    
    return await crud_set.get_set(db, target_id)

async def import_set(db: AsyncSession, set_in: SetImport) -> Set:
    from app.services.import_service import load_image
    from app.crud.settings import get_setting
    from app.services.audit_service import calculate_phash
    from app.core.enums import ImageRating

    db_creators = []
    for name in set_in.creator_names:
        creator = await get_creator_by_name(db, name)
        if not creator:
            creator = await create_creator(db, CreatorCreate(canonical_name=name))
        
        existing_set = await crud_set.get_set_by_title_and_creator(db, set_in.title, creator.id)
        if existing_set:
            raise DuplicateResourceError(f"Set '{set_in.title}' already exists for creator '{name}'")
            
        db_creators.append(creator)
    
    db_set = Set(
        title=set_in.title,
        local_path=set_in.local_path,
        notes=set_in.notes
    )
    db_set.creators = db_creators

    if set_in.images:
        h_ratio_setting = await get_setting(db, "horizontal_target_ratio")
        v_ratio_setting = await get_setting(db, "vertical_target_ratio")
        h_label = h_ratio_setting.value.replace("/", "x") if h_ratio_setting and h_ratio_setting.value else "16x9"
        v_label = v_ratio_setting.value.replace("/", "x") if v_ratio_setting and v_ratio_setting.value else "9x16"
        
        new_images = []
        for image_in in set_in.images:
            img_data = image_in.model_dump()
            
            p = anyio.Path(img_data["local_path"])
            p_lib = Path(img_data["local_path"])
            
            if not img_data.get("phash"):
                img_data["phash"] = await anyio.to_thread.run_sync(calculate_phash, p_lib)
                
            if img_data.get("width") is None or img_data.get("height") is None:
                img_cv = await anyio.to_thread.run_sync(load_image, img_data["local_path"])
                if img_cv is not None:
                    height, width = img_cv.shape[:2]
                    img_data["width"] = width
                    img_data["height"] = height
                    img_data["aspect_ratio"] = float(width)/float(height) if height != 0 else 0
                    
            if not img_data.get("aspect_ratio_label"):
                w = img_data.get("width")
                h = img_data.get("height")
                if w is not None and h is not None:
                    img_data["aspect_ratio_label"] = h_label if w >= h else v_label
                    
            if img_data.get("file_size") is None:
                if await p.exists():
                    stat = await p.stat()
                    img_data["file_size"] = stat.st_size
                else:
                    img_data["file_size"] = None
            
            if not img_data.get("rating"):
                img_data["rating"] = ImageRating.QUESTIONABLE
                
            new_images.append(Image(**img_data))
            
        db_set.images = new_images

    db.add(db_set)
    await db.commit()
    await db.refresh(db_set)
    return await crud_set.get_set(db, db_set.id)

async def bulk_update_sets(db: AsyncSession, bulk_in: SetBulkUpdate) -> int:
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    count = await crud_set.bulk_update_sets(db, bulk_in)
    
    # We should iterate over them here and do folder renaming
    result = await db.execute(
        select(Set).options(selectinload(Set.creators), selectinload(Set.images)).where(Set.id.in_(bulk_in.set_ids))
    )
    db_sets = result.scalars().all()
    for db_set in db_sets:
        await rename_set_folder_if_needed(db_set)
        db.add(db_set)
    await db.commit()
    return count

async def resync_set(db: AsyncSession, set_id: int) -> Optional[Set]:
    from app.services.audit_service import calculate_phash, calculate_dominant_color
    from app.services.import_service import load_image
    from app.crud.settings import get_setting
    from app.core.enums import ImageRating
    import anyio
    
    db_set = await crud_set.get_set(db, set_id)
    if not db_set or not db_set.local_path:
        return None
    
    folder_path = anyio.Path(db_set.local_path)
    if not await folder_path.exists() or not await folder_path.is_dir():
        return None
    
    image_exts = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff'}
    
    disk_files = {} 
    async for file in folder_path.iterdir():
        if await file.is_file() and file.suffix.lower() in image_exts:
            disk_files[str(file)] = None

    db_images = {img.local_path: img for img in db_set.images if img.local_path}
    
    untracked_paths = [p for p in disk_files if p not in db_images]
    missing_records = [img for p, img in db_images.items() if not await anyio.Path(p).exists()]
    
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
                possible_ghosts = [g for g in ghost_map[ph] if g not in recovered_records]
                if possible_ghosts:
                    ghost = possible_ghosts[0]
                    ghost.local_path = path_str
                    recovered_paths.add(path_str)
                    recovered_records.add(ghost)
        
        untracked_paths = [p for p in untracked_paths if p not in recovered_paths]
        missing_records = [g for g in missing_records if g not in recovered_records]

    if untracked_paths:
        from sqlalchemy import select
        existing_res = await db.execute(select(Image.local_path).where(Image.local_path.in_(untracked_paths)))
        globally_tracked = set(existing_res.scalars().all())
        untracked_paths = [p for p in untracked_paths if p not in globally_tracked]

    default_rating = ImageRating.QUESTIONABLE
    h_ratio_setting = await get_setting(db, "horizontal_target_ratio")
    v_ratio_setting = await get_setting(db, "vertical_target_ratio")
    h_label = h_ratio_setting.value.replace("/", "x") if h_ratio_setting and h_ratio_setting.value else "16x9"
    v_label = v_ratio_setting.value.replace("/", "x") if v_ratio_setting and v_ratio_setting.value else "9x16"

    for path_str in untracked_paths:
        p = anyio.Path(path_str)
        p_lib = Path(path_str)
        ph = await anyio.to_thread.run_sync(calculate_phash, p_lib)
        
        img_cv = await anyio.to_thread.run_sync(load_image, path_str)
        w, h, ar, ratio_label = None, None, None, None
        if img_cv is not None:
            height, width = img_cv.shape[:2]
            w, h = width, height
            ar = float(w)/float(h) if h != 0 else 0
            ratio_label = h_label if w >= h else v_label
            
        stat = await p.stat()
        file_size = stat.st_size
        dominant_color = await anyio.to_thread.run_sync(calculate_dominant_color, p_lib)

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
            dominant_color=dominant_color
        )
        db.add(new_img)
        
    for ghost in missing_records:
        await db.delete(ghost)
        
    await db.commit()
    await db.refresh(db_set)
    return await crud_set.get_set(db, set_id)

