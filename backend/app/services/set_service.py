"""
Service layer for set operations.

Handles business logic, folder renaming, and image processing for wallpaper sets.
Delegates purely database-related operations to the CRUD layer.
"""
from typing import Optional
import re
import anyio
import structlog
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession
from app.models.set import Set
from app.models.image import Image
from app.schemas.set import SetCreate, SetImport, SetUpdate, SetBulkUpdate
from app.core.exceptions import FileSystemError, ResourceNotFoundError, DuplicateResourceError
from app.crud import set as crud_set
from app.crud.creator import get_creator_by_name, create_creator
from app.schemas.creator import CreatorCreate

logger = structlog.get_logger(__name__)

def sanitize_folder_name(name: str) -> str:
    """Removes invalid characters from a string to make it safe for directory names."""
    sanitized = re.sub(r'[\\/:*?"<>|]', '', name).strip()
    return sanitized.rstrip('.')

async def rename_set_folder_if_needed(db: AsyncSession, db_set: Set, raise_errors: bool = False) -> None:
    """Checks and renames a set's physical folder to match convention using anyio.
    """
    if not db_set.local_path:
        return
        
    creator_names = [sanitize_folder_name(c.canonical_name) for c in db_set.creators]
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
                
                # Direct SQL UPDATE to update image paths without loading the collection
                import sys
                from sqlalchemy import update
                from app.models.image import Image
                
                sep = "\\" if sys.platform == "win32" else "/"
                await db.execute(
                    update(Image)
                    .where(Image.set_id == db_set.id)
                    .values(local_path=str(new_path) + sep + Image.filename)
                )
            except Exception as e:
                logger.error("Error renaming set folder", error=str(e), exc_info=True)
                if raise_errors:
                    raise FileSystemError(f"Failed to rename folder for set '{db_set.title}': {str(e)}")

async def create_set(db: AsyncSession, set_in: SetCreate) -> Set:
    """Creates a new Set record and performs necessary file system/image processing."""
    # Move the phash/cv2 logic here from crud.set
    # Actually, we should prepare the image schemas and then pass to CRUD.
    
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
    await rename_set_folder_if_needed(db, db_set)
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

        # Merge creators using ORM to avoid StaleDataError
        for c in list(source_set.creators):
            if c not in target_set.creators:
                target_set.creators.append(c)
        source_set.creators = []

        # Merge tags using ORM
        for t in list(source_set.tags):
            if t not in target_set.tags:
                target_set.tags.append(t)
        source_set.tags = []

        # Merge characters using ORM (which was previously missing!)
        for char in list(source_set.characters):
            if char not in target_set.characters:
                target_set.characters.append(char)
        source_set.characters = []
            
        if source_set.notes:
            target_set.notes = (target_set.notes or "") + "\n" + source_set.notes
            target_set.notes = target_set.notes.strip()
            
        source_path = source_set.local_path
        
        if not failed_images:
            await db.flush()
            await db.delete(source_set)
            
            if source_path and target_path and str(anyio.Path(source_path)) != str(target_path):
                try:
                    await anyio.to_thread.run_sync(os.rmdir, source_path)
                except OSError:
                    pass
                    
    await db.commit()
    await db.refresh(target_set)
    await rename_set_folder_if_needed(db, target_set)
    
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


def check_and_clear_stale_thumbnails(images: list[dict], thumbs_dir: Path) -> None:
    """
    Synchronously check modification times of original images versus cached thumbnails,
    and delete thumbnails that are older than the original image file.
    """
    import os
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
    from app.services.audit_service import calculate_phash, calculate_dominant_color
    from app.services.import_service import load_image
    from app.crud.settings import get_setting
    from app.core.enums import ImageRating
    import anyio
    
    db_set = await crud_set.get_set(db, set_id)
    if not db_set or not db_set.local_path:
        return None

    # Check for stale thumbnails for existing images in the set
    images_info = [{"id": img.id, "local_path": img.local_path} for img in db_set.images if img.id and img.local_path]
    thumbs_dir = Path(__file__).resolve().parent.parent.parent.parent / "db" / "thumbs"
    if images_info:
        await anyio.to_thread.run_sync(check_and_clear_stale_thumbnails, images_info, thumbs_dir)

    
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


def _safe_log_val(val):
    """Recursively convert strings to ASCII backslash-replaced representation to prevent UnicodeEncodeError in console."""
    if isinstance(val, str):
        return val.encode('ascii', 'backslashreplace').decode('ascii')
    elif isinstance(val, list):
        return [_safe_log_val(x) for x in val]
    elif isinstance(val, dict):
        return {_safe_log_val(k): _safe_log_val(v) for k, v in val.items()}
    return val


async def auto_tag_set(db: AsyncSession, set_id: int, task_id: Optional[str] = None) -> Optional[Set]:
    """
    Manually run AI auto-tagging on an existing Set.
    Analyzes all images, appends detected general tags to the images,
    appends character tags to the Set, and computes Set rollup tags.
    Saves and commits all changes. Prevents duplicate tag/character associations.
    """
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models.image import Image as ImageModel
    from app.crud.settings import get_setting
    from app.services.ai_tagging import get_tagger
    from app.core import tasks
    from app.core.enums import TaskStatus
    import asyncio

    # 1. Fetch Set with eager relations
    stmt = (
        select(Set)
        .options(
            selectinload(Set.images).selectinload(ImageModel.tags),
            selectinload(Set.tags),
            selectinload(Set.characters)
        )
        .where(Set.id == set_id)
    )
    result = await db.execute(stmt)
    db_set = result.scalars().first()
    if not db_set:
        if task_id:
            await tasks.update_task(db, task_id, status=TaskStatus.ERROR, error_message="Set not found")
        return None

    try:
        # 2. Load settings (ignoring global enabled switch since manually triggered)
        model_source_setting = await get_setting(db, "ai_model_source")
        model_source = model_source_setting.value if model_source_setting and model_source_setting.value else "predefined"

        model_type_setting = await get_setting(db, "ai_model_type")
        model_type = model_type_setting.value if model_type_setting and model_type_setting.value else "wd14_onnx"

        custom_repo_setting = await get_setting(db, "ai_model_custom_repo")
        custom_repo = custom_repo_setting.value if custom_repo_setting and custom_repo_setting.value else None

        custom_path_setting = await get_setting(db, "ai_model_custom_path")
        custom_path = custom_path_setting.value if custom_path_setting and custom_path_setting.value else None

        confidence_setting = await get_setting(db, "ai_confidence_threshold")
        try:
            confidence_threshold = float(confidence_setting.value) if confidence_setting and confidence_setting.value else 0.35
        except (ValueError, TypeError):
            confidence_threshold = 0.35

        rollup_threshold_setting = await get_setting(db, "ai_rollup_threshold")
        try:
            rollup_threshold = float(rollup_threshold_setting.value) if rollup_threshold_setting and rollup_threshold_setting.value else 0.3
        except (ValueError, TypeError):
            rollup_threshold = 0.3

        logger.info("Executing manual Set auto-tagging", 
                    set_id=set_id,
                    set_title=_safe_log_val(db_set.title), 
                    model_type=_safe_log_val(model_type), 
                    confidence_threshold=confidence_threshold, 
                    rollup_threshold=rollup_threshold)

        # 3. Load tagger
        tagger = get_tagger(
            model_source=model_source,
            model_type=model_type,
            custom_repo=custom_repo,
            custom_path=custom_path
        )
        all_detected_characters = set()

        # 4. Iterate over images and tag
        if db_set.images:
            total_images = len(db_set.images)
            if task_id:
                await tasks.update_task(db, task_id, status=TaskStatus.PROCESSING, progress=0, total=total_images)

            for index, img in enumerate(db_set.images):
                if not img.local_path:
                    if task_id:
                        await tasks.update_task(db, task_id, progress=index + 1)
                    continue
                
                p = Path(img.local_path)
                if not p.exists():
                    logger.warning("Skipping tagging for non-existent image path", path=_safe_log_val(img.local_path))
                    if task_id:
                        await tasks.update_task(db, task_id, progress=index + 1)
                    continue

                try:
                    logger.info("Running AI auto-tagging on existing image", path=_safe_log_val(img.local_path))
                    general_tags, character_tags = await asyncio.to_thread(
                        tagger.tag_image,
                        img.local_path,
                        threshold=confidence_threshold
                    )

                    if character_tags:
                        for char_name in character_tags:
                            all_detected_characters.add(char_name)

                    logger.info("AI tagging completed for image", 
                                path=_safe_log_val(img.local_path), 
                                general_tags=_safe_log_val(general_tags), 
                                character_tags=_safe_log_val(character_tags))

                    if general_tags:
                        from app.crud.tag import get_tags_by_names
                        image_tags_list = await get_tags_by_names(db, general_tags)
                        
                        # Merge tags ensuring no duplicates
                        current_tag_ids = {t.id for t in img.tags}
                        added_count = 0
                        for t in image_tags_list:
                            if t.id not in current_tag_ids:
                                img.tags.append(t)
                                current_tag_ids.add(t.id)
                                added_count += 1
                        
                        logger.info("Merged tags to image record", 
                                    path=_safe_log_val(img.local_path), 
                                    total_associated=len(img.tags), 
                                    newly_added=added_count)
                except Exception as tag_err:
                    logger.error("Failed to run AI tagging on image during Set tag run", path=_safe_log_val(img.local_path), error=_safe_log_val(str(tag_err)))
                
                if task_id:
                    await tasks.update_task(db, task_id, progress=index + 1)

        # 5. Resolve and merge character tags to the Set (preventing duplicates)
        if all_detected_characters:
            from app.crud.character import get_characters_by_names
            logger.info("Resolving AI character tags for Set", set_title=_safe_log_val(db_set.title), characters=_safe_log_val(list(all_detected_characters)))
            db_characters = await get_characters_by_names(db, list(all_detected_characters))
            
            current_char_ids = {c.id for c in db_set.characters}
            char_added_count = 0
            for c in db_characters:
                if c.id not in current_char_ids:
                    db_set.characters.append(c)
                    current_char_ids.add(c.id)
                    char_added_count += 1
            logger.info("Merged characters to Set", set_title=_safe_log_val(db_set.title), total_characters=len(db_set.characters), newly_added=char_added_count)

        # 6. Compute Set rollup tags and merge
        if db_set.images:
            tag_counts = {}
            tag_objects = {}
            for img in db_set.images:
                for t in img.tags:
                    tag_counts[t.name] = tag_counts.get(t.name, 0) + 1
                    tag_objects[t.name] = t

            logger.info("Computing Set rollup tags", set_title=_safe_log_val(db_set.title), total_images=len(db_set.images), tag_frequencies=_safe_log_val({name: f"{count}/{len(db_set.images)}" for name, count in tag_counts.items()}))

            rollup_tags = []
            num_images = len(db_set.images)
            for tag_name, count in tag_counts.items():
                freq = float(count) / num_images
                if freq >= rollup_threshold:
                    rollup_tags.append(tag_objects[tag_name])

            current_set_tag_ids = {t.id for t in db_set.tags}
            rollup_added_count = 0
            for t in rollup_tags:
                if t.id not in current_set_tag_ids:
                    db_set.tags.append(t)
                    current_set_tag_ids.add(t.id)
                    rollup_added_count += 1
            logger.info("Merged rollup tags to Set", set_title=_safe_log_val(db_set.title), total_set_tags=len(db_set.tags), newly_added=rollup_added_count)

        db.add(db_set)
        await db.commit()
        await db.refresh(db_set)

        if task_id:
            total_images = len(db_set.images) if db_set.images else 0
            await tasks.update_task(db, task_id, status=TaskStatus.COMPLETED, progress=total_images, total=total_images)

        return await crud_set.get_set(db, set_id)

    except Exception as err:
        logger.error("Failed auto-tagging set", set_id=set_id, error=str(err))
        if task_id:
            await tasks.update_task(db, task_id, status=TaskStatus.ERROR, error_message=str(err))
        raise err


async def run_auto_tag_set_background(set_id: int, task_id: str) -> None:
    """
    Background task to run AI auto-tagging on a Set.
    Creates its own database session and coordinates progress updates.
    """
    from app.db.session import SessionLocal
    async with SessionLocal() as db:
        try:
            await auto_tag_set(db, set_id=set_id, task_id=task_id)
        except Exception as e:
            logger.error("Background auto-tagging set task failed", set_id=set_id, task_id=task_id, error=str(e))


