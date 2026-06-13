"""
CRUD operations and business logic for managing wallpaper sets and bulk imports.
"""
from typing import Optional
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.models.creator import Creator
from app.models.set import Set
from app.models.image import Image
from app.models.character import Character
from app.models.franchise import Franchise
from app.models.tag import Tag
from app.schemas.set import (
    SetCreate, 
    SetImport, 
    SetUpdate,
    BatchImportRequest, 
    BatchImportResponse,
    SetBulkUpdate
)
from app.core.enums import BulkOperationMode, TaskStatus
from app.crud.creator import get_creator_by_name, create_creator
from app.schemas.creator import CreatorCreate
from app.crud.settings import get_setting
from app.core import tasks
from app.db.session import SessionLocal
from pathlib import Path
import re
import structlog

logger = structlog.get_logger(__name__)

def sanitize_folder_name(name: str) -> str:
    """Removes invalid characters from a string to make it safe for directory names.

    Args:
        name: The original string.

    Returns:
        The sanitized string, safe for file paths.
    """
    # Remove invalid characters: \ / : * ? " < > |
    return re.sub(r'[\\/:*?"<>|]', '', name).strip()

def rename_set_folder_if_needed(db_set: Set, raise_errors: bool = False) -> None:
    """Checks and renames a set's physical folder to match convention.

    Convention: '[Creators] - [Sanitized Title]'
    Also updates the local_path of the Set and all its associated Images.

    Args:
        db_set: The Set object whose folder might need renaming.
        raise_errors: If True, raises exceptions on filesystem errors.

    Raises:
        Exception: If rename fails and raise_errors is True.
    """
    if not db_set.local_path:
        return
        
    # Generate new folder name based on convention: [Creators] - [Sanitized Title]
    creator_names = [c.canonical_name for c in db_set.creators]
    creators_str = " & ".join(creator_names) if creator_names else "Unknown"
    sanitized_title = sanitize_folder_name(db_set.title) if db_set.title else "Untitled"
    new_folder_name = f"{creators_str} - {sanitized_title}"
    
    old_path = Path(db_set.local_path)
    if old_path.exists() and old_path.is_dir():
        new_path = old_path.with_name(new_folder_name)
        
        # Perform rename if necessary and new path doesn't already exist
        if new_path != old_path and not new_path.exists():
            try:
                old_path.rename(new_path)
                db_set.local_path = str(new_path)
                
                # Update paths for all images within the set
                if db_set.images:
                    for img in db_set.images:
                        img_old_path = Path(img.local_path)
                        img_new_path = new_path / img_old_path.name
                        img.local_path = str(img_new_path)
            except Exception as e:
                logger.error("Error renaming set folder", error=str(e), exc_info=True)
                if raise_errors:
                    raise Exception(f"Failed to rename folder for set '{db_set.title}': {str(e)}")
                # We don't raise here by default to prevent blocking the metadata update if FS fails

async def get_set(db: AsyncSession, set_id: int) -> Optional[Set]:
    """Retrieves a specific set by its ID, including creators and images.

    Args:
        db: Database session.
        set_id: ID of the set.

    Returns:
        The Set object if found, otherwise None.
    """
    result = await db.execute(
        select(Set).options(
            selectinload(Set.creators),
            selectinload(Set.images),
            selectinload(Set.tags),
            selectinload(Set.characters)
        ).filter(Set.id == set_id)
    )
    return result.scalar_one_or_none()


async def get_sets(db: AsyncSession, skip: int = 0, limit: int = 100, search: Optional[str] = None, creator_type: Optional[str] = None, sort_by: Optional[str] = "id", sort_dir: Optional[str] = "desc", tag: Optional[str] = None, character: Optional[list[str]] = None, franchise: Optional[list[str]] = None) -> tuple[list[Set], int]:
    """Retrieves a paginated list of sets, with optional filtering.

    Args:
        db: Database session.
        skip: Number of records to skip.
        limit: Maximum number of records to return.
        search: Optional search term matching title or creator names.
        creator_type: Optional creator type filter.

    Returns:
        A tuple containing a list of Set objects and the total match count.
    """
    # Base query for sets
    query = select(Set)
    
    # Joins for filtering if needed
    if tag or search or character or franchise or creator_type:
        query = query.outerjoin(Set.creators).outerjoin(Set.tags).outerjoin(Set.characters).outerjoin(Character.franchise)
    
    # Apply filters
    if creator_type:
        query = query.filter(Creator.type == creator_type)
    if tag:
        query = query.filter(Set.tags.any(Tag.name.icontains(tag)))
    if character:
        query = query.filter(Set.characters.any(Character.name.in_(character)))
    if franchise:
        query = query.filter(Set.characters.any(Character.franchise.has(Franchise.name.in_(franchise))))
    if search:
        query = query.filter(
            or_(
                Set.title.icontains(search),
                Set.tags.any(Tag.name.icontains(search)),
                Creator.canonical_name.icontains(search),
                Character.name.icontains(search),
                Franchise.name.icontains(search)
            )
        )
    
    # Total count for filtered results
    count_query = select(func.count()).select_from(query.distinct().subquery())
    count_result = await db.execute(count_query)
    total = count_result.scalar_one()

    # Sorting logic
    if sort_by == "title":
        order_col = func.lower(Set.title)
    elif sort_by == "image_count":
        # Subquery to count images for each set
        subq = select(func.count(Image.id)).where(Image.set_id == Set.id).scalar_subquery()
        order_col = subq
    else:
        order_col = Set.date_added
        
    if sort_dir == "asc":
        order_expr = order_col.asc()
    else:
        order_expr = order_col.desc()

    # Final paginated query with relationship loading
    # We use distinct() because the join might create multiple rows per set
    sets_query = query.distinct().options(
        selectinload(Set.creators),
        selectinload(Set.images),
        selectinload(Set.tags),
        selectinload(Set.characters)
    ).order_by(order_expr, Set.id.desc()).offset(skip).limit(limit)
    
    result = await db.execute(sets_query)
    return list(result.scalars().all()), total

async def create_set(db: AsyncSession, set_in: SetCreate) -> Set:
    """Creates a new Set record and associates requested creators and images.

    Args:
        db: Database session.
        set_in: The creation schema containing set details.

    Returns:
        The newly created Set object.
    """
    data = set_in.model_dump(exclude={"creator_ids", "images", "tags", "characters"})
    # Normalize empty source_url to None to avoid UNIQUE constraint issues in SQLite
    if data.get("source_url") == "":
        data["source_url"] = None
        
    db_set = Set(**data)

    if set_in.creator_ids:
        result = await db.execute(
            select(Creator).where(Creator.id.in_(set_in.creator_ids))
        )
        creators = result.scalars().all()
        db_set.creators = list(creators)
        
    if set_in.tags:
        from app.crud.tag import get_tags_by_names
        db_set.tags = await get_tags_by_names(db, set_in.tags)

    if set_in.characters:
        from app.crud.character import get_characters_by_names
        db_set.characters = await get_characters_by_names(db, set_in.characters)
    
    if set_in.images:
        import asyncio
        from pathlib import Path
        from app.core.crop import load_image
        from app.crud.settings import get_setting
        from app.services.audit_service import calculate_phash, calculate_dominant_color

        h_ratio_setting = await get_setting(db, "horizontal_target_ratio")
        v_ratio_setting = await get_setting(db, "vertical_target_ratio")
        h_label = h_ratio_setting.value.replace("/", "x") if h_ratio_setting and h_ratio_setting.value else "16x9"
        v_label = v_ratio_setting.value.replace("/", "x") if v_ratio_setting and v_ratio_setting.value else "9x16"

        new_images = []
        for image_in in set_in.images:
            img_data = image_in.model_dump()
            
            if img_data.get("local_path"):
                p = Path(img_data["local_path"])
                
                if not img_data.get("phash"):
                    img_data["phash"] = await asyncio.to_thread(calculate_phash, p)
                    
                if img_data.get("width") is None or img_data.get("height") is None:
                    img_cv = await asyncio.to_thread(load_image, str(p))
                    if img_cv is not None:
                        height, width = img_cv.shape[:2]
                        img_data["width"] = width
                        img_data["height"] = height
                        img_data["aspect_ratio"] = float(width) / float(height) if height != 0 else 0
                        
                if not img_data.get("aspect_ratio_label"):
                    w = img_data.get("width")
                    h = img_data.get("height")
                    if w is not None and h is not None:
                        img_data["aspect_ratio_label"] = h_label if w >= h else v_label
                        
                if img_data.get("file_size") is None:
                    img_data["file_size"] = p.stat().st_size if p.exists() else None
                    
                if img_data.get("dominant_color") is None:
                    img_data["dominant_color"] = await asyncio.to_thread(calculate_dominant_color, p)

            new_images.append(Image(**img_data))
            
        db_set.images = new_images

    db.add(db_set)
    await db.commit()
    await db.refresh(db_set)
    query = (
        select(Set)
        .options(
            selectinload(Set.creators),
            selectinload(Set.images),
            selectinload(Set.tags),
            selectinload(Set.characters)
        )
        .filter(Set.id == db_set.id)
    )
    result = await db.execute(query)
    return result.scalar_one()

async def get_set_by_title_and_creator(db: AsyncSession, title: str, creator_id: int) -> Optional[Set]:
    """Checks if a set already exists with a specific title for a given creator.

    Args:
        db: Database session.
        title: Title of the set.
        creator_id: ID of the creator.

    Returns:
        The matching Set object, or None if not found.
    """
    result = await db.execute(
        select(Set)
        .join(Set.creators)
        .filter(Set.title == title)
        .filter(Creator.id == creator_id)
    )
    return result.scalar_one_or_none()

async def import_set(db: AsyncSession, set_in: SetImport) -> Set:
    """Imports a set, automatically resolving or creating creators by name.

    Args:
        db: Database session.
        set_in: Import schema containing set details and creator names.

    Raises:
        HTTPException: If the set already exists for a specified creator.

    Returns:
        The imported Set object.
    """
    db_creators = []
    for name in set_in.creator_names:
        creator = await get_creator_by_name(db, name)
        if not creator:
            creator = await create_creator(db, CreatorCreate(canonical_name=name))
        
        existing_set = await get_set_by_title_and_creator(db, set_in.title, creator.id)
        if existing_set:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=400, 
                detail=f"Set '{set_in.title}' already exists for creator '{name}'"
            )
            
        db_creators.append(creator)
    
    db_set = Set(
        title=set_in.title,
        local_path=set_in.local_path,
        notes=set_in.notes
    )
    db_set.creators = db_creators

    if set_in.images:
        from app.services.import_service import load_image
        from app.crud.settings import get_setting
        from app.services.audit_service import calculate_phash
        from app.core.enums import ImageRating
        
        h_ratio_setting = await get_setting(db, "horizontal_target_ratio")
        v_ratio_setting = await get_setting(db, "vertical_target_ratio")
        h_label = h_ratio_setting.value.replace("/", "x") if h_ratio_setting and h_ratio_setting.value else "16x9"
        v_label = v_ratio_setting.value.replace("/", "x") if v_ratio_setting and v_ratio_setting.value else "9x16"
        
        new_images = []
        for image_in in set_in.images:
            img_data = image_in.model_dump()
            
            p = Path(img_data["local_path"])
            if not img_data.get("phash"):
                img_data["phash"] = calculate_phash(p)
                
            if img_data.get("width") is None or img_data.get("height") is None:
                img_cv = load_image(img_data["local_path"])
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
                img_data["file_size"] = p.stat().st_size if p.exists() else None
            
            if not img_data.get("rating"):
                img_data["rating"] = ImageRating.QUESTIONABLE
                
            new_images.append(Image(**img_data))
            
        db_set.images = new_images

    db.add(db_set)
    await db.commit()
    await db.refresh(db_set)
    
    query = (
        select(Set)
        .options(
            selectinload(Set.creators),
            selectinload(Set.images),
            selectinload(Set.tags),
            selectinload(Set.characters)
        )
        .filter(Set.id == db_set.id)
    )
    result = await db.execute(query)
    return result.scalar_one()

async def delete_set(db: AsyncSession, set_id: int) -> Optional[Set]:
    """Deletes a set record from the database.

    Args:
        db: Database session.
        set_id: ID of the set to delete.

    Returns:
        The deleted Set object, or None if not found.
    """
    db_set = await get_set(db, set_id)
    if db_set:
        await db.delete(db_set)
        await db.commit()
    return db_set


async def update_set(db: AsyncSession, set_id: int, set_in: SetUpdate) -> Optional[Set]:
    """Updates an existing set and manages physical folder renaming.

    Args:
        db: Database session.
        set_id: ID of the set to update.
        set_in: The set update schema with modified data.

    Returns:
        The updated Set object, or None if not found.
    """
    db_set = await get_set(db, set_id)
    if not db_set:
        return None
    
    update_data = set_in.model_dump(exclude_unset=True, exclude={"creator_ids", "tags", "characters"})
    # Normalize empty source_url to None to avoid UNIQUE constraint issues in SQLite
    if "source_url" in update_data and update_data["source_url"] == "":
        update_data["source_url"] = None
        
    for field in update_data:
        setattr(db_set, field, update_data[field])
    
    if set_in.creator_ids is not None:
        result = await db.execute(
            select(Creator).where(Creator.id.in_(set_in.creator_ids))
        )
        creators = result.scalars().all()
        db_set.creators = list(creators)

    if set_in.tags is not None:
        from app.crud.tag import get_tags_by_names
        db_set.tags = await get_tags_by_names(db, set_in.tags)
        
    if set_in.characters is not None:
        from app.crud.character import get_characters_by_names
        db_set.characters = await get_characters_by_names(db, set_in.characters)
    
    # Automatic Folder Renaming Logic
    rename_set_folder_if_needed(db_set)
    
    db.add(db_set)
    await db.commit()
    await db.refresh(db_set)
    
    # Re-fetch with relationships
    return await get_set(db, set_id)


async def bulk_update_sets(db: AsyncSession, bulk_in: SetBulkUpdate) -> int:
    """Performs bulk updates on multiple sets.

    Handles appending, removing, or replacing tags and creators across sets,
    and ensures folder renaming logic fires where applicable.

    Args:
        db: Database session.
        bulk_in: Schema containing the sets to update and the modifications.

    Returns:
        The number of sets successfully updated.
    """
    # 1. Fetch all target sets with creators, images, and tags
    result = await db.execute(
        select(Set).options(
            selectinload(Set.creators), 
            selectinload(Set.images),
            selectinload(Set.tags),
            selectinload(Set.characters)
        ).where(Set.id.in_(bulk_in.set_ids))
    )
    db_sets = result.scalars().all()
    
    if not db_sets:
        return 0
    
    # 2. Get Creators if creator_ids provided
    target_creators = []
    if bulk_in.update_data.creator_ids is not None:
        c_result = await db.execute(
            select(Creator).where(Creator.id.in_(bulk_in.update_data.creator_ids))
        )
        target_creators = c_result.scalars().all()
        
    # 3. Get Tags if tags provided
    target_tags = []
    if bulk_in.update_data.tags is not None:
        from app.crud.tag import get_tags_by_names
        target_tags = await get_tags_by_names(db, bulk_in.update_data.tags)

    # 3.5. Get Characters if provided
    target_characters = []
    if bulk_in.update_data.characters is not None:
        from app.crud.character import get_characters_by_names
        target_characters = await get_characters_by_names(db, bulk_in.update_data.characters)

    # 4. Apply updates
    update_fields = bulk_in.update_data.model_dump(exclude_unset=True, exclude={"creator_ids", "tags", "characters"})
    
    for db_set in db_sets:
        # Standard fields (notes, title, etc)
        for field in update_fields:
            if bulk_in.operation_mode == BulkOperationMode.APPEND and field == "notes":
                current_notes = db_set.notes or ""
                new_notes = update_fields[field] or ""
                db_set.notes = f"{current_notes}\n{new_notes}".strip() if current_notes else new_notes
            elif bulk_in.operation_mode == BulkOperationMode.REMOVE and field == "notes":
                db_set.notes = None
            else:
                setattr(db_set, field, update_fields[field])
                
        # Tags logic
        if bulk_in.update_data.tags is not None:
            if bulk_in.operation_mode == BulkOperationMode.APPEND:
                current_ids = {t.id for t in db_set.tags}
                to_add = [t for t in target_tags if t.id not in current_ids]
                db_set.tags.extend(to_add)
            elif bulk_in.operation_mode == BulkOperationMode.REMOVE:
                remove_ids = {t.id for t in target_tags}
                db_set.tags = [t for t in db_set.tags if t.id not in remove_ids]
            else:
                db_set.tags = list(target_tags)

        # Characters logic
        if bulk_in.update_data.characters is not None:
            if bulk_in.operation_mode == BulkOperationMode.APPEND:
                current_ids = {c.id for c in db_set.characters}
                to_add = [c for c in target_characters if c.id not in current_ids]
                db_set.characters.extend(to_add)
            elif bulk_in.operation_mode == BulkOperationMode.REMOVE:
                remove_ids = {c.id for c in target_characters}
                db_set.characters = [c for c in db_set.characters if c.id not in remove_ids]
            else:
                db_set.characters = list(target_characters)
        
        # Creator logic
        if bulk_in.update_data.creator_ids is not None:
            if bulk_in.operation_mode == BulkOperationMode.APPEND:
                current_ids = {c.id for c in db_set.creators}
                to_add = [c for c in target_creators if c.id not in current_ids]
                db_set.creators.extend(to_add)
            elif bulk_in.operation_mode == BulkOperationMode.REMOVE:
                remove_ids = {c.id for c in target_creators}
                db_set.creators = [c for c in db_set.creators if c.id not in remove_ids]
            else:
                db_set.creators = list(target_creators)
        
        # Automatic Folder Renaming Logic
        rename_set_folder_if_needed(db_set)
        
        db.add(db_set)

    await db.commit()
    return len(db_sets)


async def merge_sets(db: AsyncSession, source_ids: list[int], target_id: int) -> Optional[Set]:
    """Merges multiple source sets into a single target set.

    Physically moves images on disk, updates database paths, combines tags
    and notes, and merges creators. Deletes source sets afterward.

    Args:
        db: Database session.
        source_ids: List of source set IDs to merge.
        target_id: ID of the destination set.

    Returns:
        The updated target Set object, or None if the target was not found.
    """
    import shutil
    import os
    from pathlib import Path

    # 1. Fetch target set
    target_set = await get_set(db, target_id)
    if not target_set:
        return None
    
    target_path = Path(target_set.local_path) if target_set.local_path else None
    
    # Ensure target path directory exists if it's set
    if target_path and not target_path.exists():
        try:
            target_path.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            logger.error("Could not create target directory", path=str(target_path), error=str(e))
    
    # 2. Iterate through source sets
    for sid in source_ids:
        if sid == target_id:
            continue
        
        source_set = await get_set(db, sid)
        if not source_set:
            continue
            
        # If target set has no physical path, adopt the path of the first source set that does
        if not target_path and source_set.local_path:
            target_path = Path(source_set.local_path)
            target_set.local_path = str(target_path)
            if not target_path.exists():
                try:
                    target_path.mkdir(parents=True, exist_ok=True)
                except Exception as e:
                    logger.error("Could not create adopted target directory", path=str(target_path), error=str(e))
        
        # Move images physically and update paths
        failed_images = []
        if target_path:
            for img in source_set.images:
                old_p = Path(img.local_path) if img.local_path else None
                if not old_p:
                    continue
                
                new_p = target_path / old_p.name
                
                # Case 1: File is at the source location - Move it to target
                if old_p.exists() and old_p.parent != target_path:
                    # Handle collisions
                    counter = 1
                    actual_new_p = new_p
                    while actual_new_p.exists():
                        actual_new_p = target_path / f"{old_p.stem}_{counter}{old_p.suffix}"
                        counter += 1
                    
                    try:
                        shutil.move(str(old_p), str(actual_new_p))
                        img.local_path = str(actual_new_p)
                    except Exception as e:
                        logger.error("Error moving image", path=str(old_p), error=str(e), exc_info=True)
                        failed_images.append(img)
                
                # Case 2: File was already moved to target manually (or by partial merge)
                elif new_p.exists():
                    img.local_path = str(new_p)

        # Re-associate images properly to avoid cascade-delete-orphan
        images_to_move = [img for img in source_set.images if img not in failed_images]
        
        # Remove successfully moved images from source_set
        source_set.images = failed_images
        
        for img in images_to_move:
            img.set_id = target_id
            target_set.images.append(img)
            
        # Re-associate creators
        for c in source_set.creators:
            if c not in target_set.creators:
                target_set.creators.append(c)
                
        # Merge tags and notes
        if source_set.tags:
            current_tags = set((target_set.tags or "").split())
            new_tags = set(source_set.tags.split())
            combined = sorted(list(current_tags | new_tags))
            target_set.tags = " ".join(combined) if combined else None
            
        if source_set.notes:
            target_set.notes = (target_set.notes or "") + "\n" + source_set.notes
            target_set.notes = target_set.notes.strip()
            
        source_path = source_set.local_path
            
        # Delete source set from DB ONLY if all images were successfully moved
        if not failed_images:
            await db.delete(source_set)
            
            # Try to delete the physical source directory if it's now empty
            if source_path and target_path and str(Path(source_path)) != str(target_path):
                try:
                    os.rmdir(source_path)
                except OSError:
                    # Directory not empty or permissions error; perfectly fine to leave it.
                    pass
        
    await db.commit()
    await db.refresh(target_set)
    
    # Optional: trigger renaming if title/creators changed
    rename_set_folder_if_needed(target_set)
    
    return await get_set(db, target_id)


async def bulk_delete_sets(db: AsyncSession, set_ids: list[int]) -> int:
    """Deletes multiple sets from the database.

    Args:
        db: Database session.
        set_ids: List of set IDs to delete.

    Returns:
        The number of sets successfully deleted.
    """
    result = await db.execute(
        select(Set).where(Set.id.in_(set_ids))
    )
    db_sets = result.scalars().all()
    for db_set in db_sets:
        await db.delete(db_set)
    await db.commit()
    return len(db_sets)


async def resync_set(db: AsyncSession, set_id: int) -> Optional[Set]:
    """Resynchronizes a set's database records with its physical folder.

    Adds tracked images that appear on disk, removes missing ones from DB,
    and resolves files that were renamed or moved (using phash matching).

    Args:
        db: Database session.
        set_id: ID of the set to resync.

    Returns:
        The updated Set object, or None if it lacks a valid local path.
    """
    from app.services.audit_service import calculate_phash, calculate_dominant_color
    
    db_set = await get_set(db, set_id)
    if not db_set or not db_set.local_path:
        return None
    
    folder_path = Path(db_set.local_path)
    if not folder_path.exists() or not folder_path.is_dir():
        return None
    
    image_exts = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff'}
    
    # 1. Scan Disk
    disk_files = {} # path -> phash (deferred)
    for file in folder_path.iterdir():
        if file.is_file() and file.suffix.lower() in image_exts:
            disk_files[str(file)] = None

    # 2. Scan DB
    db_images = {img.local_path: img for img in db_set.images if img.local_path}
    
    # 3. Identify Untracked and Missing
    untracked_paths = [p for p in disk_files if p not in db_images]
    missing_records = [img for p, img in db_images.items() if not Path(p).exists()]
    
    # 4. Recovery Phase (Phash Matching)
    if untracked_paths and missing_records:
        # Build ghost map by phash
        ghost_map = {}
        for ghost in missing_records:
            if ghost.phash:
                if ghost.phash not in ghost_map:
                    ghost_map[ghost.phash] = []
                ghost_map[ghost.phash].append(ghost)
        
        recovered_paths = set()
        recovered_records = set()
        
        for path_str in untracked_paths:
            ph = calculate_phash(Path(path_str))
            if ph and ph in ghost_map:
                # Find a matching ghost that hasn't been recovered yet
                possible_ghosts = [g for g in ghost_map[ph] if g not in recovered_records]
                if possible_ghosts:
                    ghost = possible_ghosts[0]
                    ghost.local_path = path_str
                    recovered_paths.add(path_str)
                    recovered_records.add(ghost)
        
        # Cleanup processed items
        untracked_paths = [p for p in untracked_paths if p not in recovered_paths]
        missing_records = [g for g in missing_records if g not in recovered_records]

    # Filter out any paths that are already tracked by *any* set in the database
    if untracked_paths:
        existing_res = await db.execute(select(Image.local_path).where(Image.local_path.in_(untracked_paths)))
        globally_tracked = set(existing_res.scalars().all())
        untracked_paths = [p for p in untracked_paths if p not in globally_tracked]

    # 5. Finalize - Add New
    from app.core.enums import ImageRating
    
    # User requested that all new files default to QUESTIONABLE to enforce manual verification
    default_rating = ImageRating.QUESTIONABLE

    from app.services.import_service import load_image
    from app.crud.settings import get_setting
    
    h_ratio_setting = await get_setting(db, "horizontal_target_ratio")
    v_ratio_setting = await get_setting(db, "vertical_target_ratio")
    h_label = h_ratio_setting.value.replace("/", "x") if h_ratio_setting and h_ratio_setting.value else "16x9"
    v_label = v_ratio_setting.value.replace("/", "x") if v_ratio_setting and v_ratio_setting.value else "9x16"

    for path_str in untracked_paths:
        p = Path(path_str)
        ph = calculate_phash(p)
        
        img_cv = load_image(path_str)
        w, h, ar, ratio_label = None, None, None, None
        if img_cv is not None:
            height, width = img_cv.shape[:2]
            w, h = width, height
            ar = float(w)/float(h) if h != 0 else 0
            ratio_label = h_label if w >= h else v_label
            
        file_size = p.stat().st_size if p.exists() else None
        dominant_color = calculate_dominant_color(p)

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
        
    # 6. Finalize - Remove remaining missing
    for ghost in missing_records:
        await db.delete(ghost)
        
    await db.commit()
    await db.refresh(db_set)
    return await get_set(db, set_id)


async def batch_import_sets(db: AsyncSession, batch_in: BatchImportRequest, task_id: str = None) -> BatchImportResponse:
    """Executes a batch import process for multiple folders.

    Parses candidate folders, validates them, and optionally imports and crops
    images to the vault location.

    Args:
        db: Database session.
        batch_in: Request payload detailing paths and import behaviors.
        task_id: Optional ID for progress tracking.

    Returns:
        A response object detailing the success/failure of each imported item.
    """
    from app.services import import_service
    # 1. Gather
    candidates = await import_service.gather_candidates(db, batch_in)
    
    # 2. Parse & Validate
    regex = import_service.compile_parsing_regex(batch_in.parsing_template)
    results = await import_service.parse_and_validate_candidates(db, candidates, regex)

    if batch_in.dry_run:
        return BatchImportResponse(items=results)

    # 3. Execution Phase
    # Get vault path
    vault_setting = await get_setting(db, "base_library_path")
    if not vault_setting or not vault_setting.value:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="base_library_path not configured")
    
    vault_root = Path(vault_setting.value)
    
    # Get target ratios from settings
    h_ratio_setting = await get_setting(db, "horizontal_target_ratio")
    v_ratio_setting = await get_setting(db, "vertical_target_ratio")
    
    h_label_raw = h_ratio_setting.value if h_ratio_setting else "16/9"
    v_label_raw = v_ratio_setting.value if v_ratio_setting else "9/16"
    
    def parse_ratio(r_str: str, default: float) -> float:
        try:
            if "/" in r_str:
                num, den = r_str.split("/")
                return float(num) / float(den)
            return float(r_str)
        except (ValueError, TypeError):
            return default

    h_ratio = parse_ratio(h_label_raw, 16.0/9.0)
    v_ratio = parse_ratio(v_label_raw, 9.0/16.0)
    
    h_label = h_label_raw.replace("/", "x")
    v_label = v_label_raw.replace("/", "x")
    
    final_results = []
    total_items = len(results)
    for idx, item in enumerate(results):
        if task_id:
            await tasks.update_task(db, task_id, progress=idx, total=total_items)
            
        processed_item = await import_service.execute_import_item(
            db=db,
            item=item,
            vault_root=vault_root,
            h_ratio=h_ratio,
            v_ratio=v_ratio,
            h_label=h_label,
            v_label=v_label,
            delete_source_default=batch_in.delete_source_default
        )
        final_results.append(processed_item)

    await db.commit()
    if task_id:
        await tasks.update_task(db, task_id, progress=total_items, total=total_items)
    return BatchImportResponse(items=final_results)

async def run_batch_import_background(batch_in: BatchImportRequest, task_id: str) -> None:
    """Entry point for running batch imports as a background task.

    Manages its own database session and updates the task status upon
    completion or error.

    Args:
        batch_in: Request payload for the batch import.
        task_id: The ID of the task to update.
    """
    async with SessionLocal() as db:
        try:
            await tasks.update_task(db, task_id, status=TaskStatus.PROCESSING)
            await batch_import_sets(db, batch_in, task_id=task_id)
            await tasks.update_task(db, task_id, status=TaskStatus.COMPLETED)
        except Exception as e:
            import traceback
            traceback.print_exc()
            await tasks.update_task(db, task_id, status=TaskStatus.ERROR, error_message=str(e))
