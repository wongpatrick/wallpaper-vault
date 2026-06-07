"""
CRUD operations for image records, including duplicate detection and resolution.
"""
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from app.models.image import Image
from app.models.set import Set
from app.models.creator import Creator
from app.schemas.image import ImageUpdate, ImageCreate, ImageBulkUpdate, ImageBulkMove
from app.core.enums import BulkOperationMode
import os
from pathlib import Path
from collections import defaultdict
import structlog

logger = structlog.get_logger(__name__)

async def get_random_image(
    db: AsyncSession, 
    tags: Optional[list[str]] = None, 
    aspect_ratio_label: Optional[str] = None,
    min_width: Optional[int] = None,
    min_height: Optional[int] = None,
    creator_id: Optional[int] = None
) -> Optional[Image]:
    """Retrieves a single random image based on optional filters.

    Args:
        db: Database session.
        tags: Optional list of tags to filter by.
        aspect_ratio_label: Optional aspect ratio label (e.g., '16:9').
        min_width: Minimum image width in pixels.
        min_height: Minimum image height in pixels.
        creator_id: Optional creator ID to filter by.

    Returns:
        A random Image object matching the filters, or None if no match is found.
    """
    query = select(Image).join(Image.set)
    
    if tags:
        for tag in tags:
            query = query.filter(Set.tags.icontains(tag))
            
    if aspect_ratio_label:
        query = query.filter(Image.aspect_ratio_label == aspect_ratio_label)
        
    if min_width:
        query = query.filter(Image.width >= min_width)
        
    if min_height:
        query = query.filter(Image.height >= min_height)
        
    if creator_id:
        query = query.join(Set.creators).filter(Creator.id == creator_id)

    query = query.order_by(func.random()).limit(1)
    
    result = await db.execute(query)
    return result.scalar_one_or_none()

async def get_image(db: AsyncSession, image_id: int) -> Optional[Image]:
    """Retrieves an image by its ID.

    Args:
        db: Database session.
        image_id: ID of the image to retrieve.

    Returns:
        The Image object if found, otherwise None.
    """
    result = await db.execute(select(Image).filter(Image.id == image_id))
    return result.scalar_one_or_none()

async def get_images_by_set(db: AsyncSession, set_id: int) -> list[Image]:
    """Retrieves all images associated with a specific set.

    Args:
        db: Database session.
        set_id: ID of the set.

    Returns:
        A list of Image objects belonging to the set, ordered by sort_order.
    """
    result = await db.execute(select(Image).filter(Image.set_id == set_id).order_by(Image.sort_order))
    return list(result.scalars().all())

async def create_image(db: AsyncSession, image_in: ImageCreate, set_id: int) -> Image:
    """Creates a new image record in the database.

    Args:
        db: Database session.
        image_in: Image creation schema containing image data.
        set_id: ID of the set this image belongs to.

    Returns:
        The newly created Image object.
    """
    existing = await db.execute(select(Image).where(Image.local_path == image_in.local_path))
    if existing.first():
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Image with this file path already exists in the database.")

    db_image = Image(**image_in.model_dump(), set_id=set_id)
    db.add(db_image)
    await db.commit()
    await db.refresh(db_image)
    return db_image

async def update_image(db: AsyncSession, image_id: int, image_in: ImageUpdate) -> Optional[Image]:
    """Updates an existing image record.

    Args:
        db: Database session.
        image_id: ID of the image to update.
        image_in: Image update schema containing updated data.

    Returns:
        The updated Image object, or None if the image was not found.
    """
    db_image = await get_image(db, image_id)
    if not db_image:
        return None
    
    update_data = image_in.model_dump(exclude_unset=True)
    for field in update_data:
        setattr(db_image, field, update_data[field])
    
    db.add(db_image)
    await db.commit()
    await db.refresh(db_image)
    return db_image

async def bulk_update_images(db: AsyncSession, bulk_in: ImageBulkUpdate) -> int:
    """Performs a bulk update on multiple image records.

    Handles tag modifications according to the specified BulkOperationMode
    (APPEND, REMOVE, REPLACE) while ignoring immutable fields like filename or phash.

    Args:
        db: Database session.
        bulk_in: Bulk update schema containing target IDs and update data.

    Returns:
        The number of images successfully updated.
    """
    result = await db.execute(select(Image).where(Image.id.in_(bulk_in.image_ids)))
    db_images = result.scalars().all()
    
    if not db_images:
        return 0
    
    # We ignore 'filename' and 'local_path' for bulk updates
    update_fields = bulk_in.update_data.model_dump(
        exclude_unset=True, 
        exclude={"filename", "local_path", "phash", "width", "height", "file_size", "aspect_ratio", "aspect_ratio_label"}
    )
    
    for db_img in db_images:
        for field in update_fields:
            if field == "tags":
                current_tags = (db_img.tags or "").split()
                new_tags = (update_fields[field] or "").split()
                
                if bulk_in.operation_mode == BulkOperationMode.APPEND:
                    combined = sorted(list(set(current_tags + new_tags)))
                    db_img.tags = " ".join(combined) if combined else None
                elif bulk_in.operation_mode == BulkOperationMode.REMOVE:
                    remaining = [t for t in current_tags if t not in new_tags]
                    db_img.tags = " ".join(remaining) if remaining else None
                else: # REPLACE
                    db_img.tags = update_fields[field]
            else:
                setattr(db_img, field, update_fields[field])
        db.add(db_img)
        
    await db.commit()
    return len(db_images)

async def delete_image(db: AsyncSession, image_id: int) -> Optional[Image]:
    """Deletes an image from the database and removes its file from disk.

    Args:
        db: Database session.
        image_id: ID of the image to delete.

    Returns:
        The deleted Image object, or None if it was not found.
    """
    db_image = await get_image(db, image_id)
    if db_image:
        if db_image.local_path:
            # Check if any other image records are using the same physical file
            other_refs_query = select(Image.id).where(
                Image.local_path == db_image.local_path,
                Image.id != image_id
            ).limit(1)
            other_refs_result = await db.execute(other_refs_query)
            has_other_refs = other_refs_result.first() is not None

            if not has_other_refs:
                # Delete file from disk
                p = Path(db_image.local_path)
                if p.exists():
                    p.unlink(missing_ok=True)
            
        await db.delete(db_image)
        await db.commit()
    return db_image

async def get_duplicate_groups(db: AsyncSession) -> list[dict]:
    """Identifies and groups images that share the same perceptual hash (phash).

    Args:
        db: Database session.

    Returns:
        A dictionary mapping a phash string to a list of duplicate Image objects.
    """
    # 1. Find phashe that appear more than once
    subquery = (
        select(Image.phash)
        .filter(Image.phash.is_not(None))
        .group_by(Image.phash)
        .having(func.count(Image.id) > 1)
    ).subquery()

    # 2. Get all images with those phashe, with set/creator context
    query = (
        select(Image)
        .join(subquery, Image.phash == subquery.c.phash)
        .options(
            selectinload(Image.set).selectinload(Set.creators)
        )
    )

    result = await db.execute(query)
    images = result.scalars().all()

    # 3. Group them in Python
    groups_dict = defaultdict(list)
    for img in images:
        groups_dict[img.phash].append(img)

    return groups_dict

async def resolve_duplicates(db: AsyncSession, keep_id: int, remove_ids: List[int]) -> dict:
    """Resolves a group of duplicates by keeping one image and deleting the rest.

    Args:
        db: Database session.
        keep_id: ID of the image to retain.
        remove_ids: List of image IDs to delete.

    Returns:
        A tuple containing (removed_count, space_saved_in_bytes).

    Raises:
        ValueError: If the keep_id image is not found.
    """
    # Verify keep_id exists
    keep_img = await get_image(db, keep_id)
    if not keep_img:
        raise ValueError("Keep image not found")

    removed_count = 0
    space_saved = 0

    for rid in remove_ids:
        db_image = await get_image(db, rid)
        if db_image:
            file_deleted = False
            
            if not db_image.local_path:
                file_deleted = True
            else:
                p = Path(db_image.local_path)
                
                # Check if any OTHER image is using this local_path that is NOT in remove_ids
                other_refs_query = select(Image.id).where(
                    Image.local_path == db_image.local_path,
                    Image.id.notin_(remove_ids)
                ).limit(1)
                other_refs_result = await db.execute(other_refs_query)
                has_other_refs = other_refs_result.first() is not None

                if not has_other_refs and p.exists():
                    file_size = p.stat().st_size
                    try:
                        os.unlink(p)
                        space_saved += file_size
                        file_deleted = True
                    except Exception as e:
                        logger.error("Error deleting file", path=str(p), error=str(e), exc_info=True)
                else:
                    # If the file doesn't exist, or it has other references, we skip physical deletion
                    # but still consider it "successful" so we can clean up this duplicate DB record.
                    file_deleted = True
            
            if file_deleted:
                # Delete DB record
                await db.delete(db_image)
                removed_count += 1
    
    await db.commit()
    return removed_count, space_saved

async def get_images(
    db: AsyncSession, 
    skip: int = 0, 
    limit: int = 100, 
    search: Optional[str] = None,
    rating: Optional[str] = None,
    sort_by: Optional[str] = "date_added",
    sort_dir: Optional[str] = "desc"
) -> tuple[List[Image], int]:
    """Retrieves a paginated list of images, optionally filtered by search terms or rating.

    Args:
        db: Database session.
        skip: Number of records to skip (for pagination).
        limit: Maximum number of records to return.
        search: Optional search term matching filename, set title, tags, or creator name.
        rating: Optional rating to filter by.
        sort_by: Field to sort by.
        sort_dir: Direction to sort ('asc' or 'desc').

    Returns:
        A tuple containing the list of Image objects and the total count of matches.
    """
    query = select(Image).join(Image.set)
    
    if rating:
        query = query.filter(Image.rating == rating)

    if search:
        query = query.join(Set.creators).filter(
            or_(
                Image.filename.icontains(search),
                Set.title.icontains(search),
                Set.tags.icontains(search),
                Creator.canonical_name.icontains(search)
            )
        )
    
    # Total count
    count_query = select(func.count()).select_from(query.distinct().subquery())
    count_result = await db.execute(count_query)
    total = count_result.scalar_one()

    # Pagination with relationship loading and sorting
    if sort_by == "file_size":
        order_col = Image.file_size
    elif sort_by == "resolution":
        order_col = Image.width * Image.height
    elif sort_by == "rating":
        order_col = Image.rating
    elif sort_by == "aspect_ratio":
        order_col = Image.aspect_ratio
    elif sort_by == "random":
        order_col = func.random()
    else:
        order_col = Image.date_added
        
    if sort_dir == "asc" and sort_by != "random":
        order_expr = order_col.asc()
    else:
        order_expr = order_col.desc() if sort_by != "random" else order_col

    # Include Image.id for deterministic sorting when values are equal
    items_query = query.distinct().options(
        selectinload(Image.set).selectinload(Set.creators)
    ).order_by(order_expr, Image.id.desc()).offset(skip).limit(limit)
    
    result = await db.execute(items_query)
    return list(result.scalars().all()), total

async def bulk_move_images(db: AsyncSession, move_in: ImageBulkMove) -> int:
    """Moves images from their current sets to a target set, both on disk and in DB.

    Args:
        db: Database session.
        move_in: Schema containing the target set ID and list of image IDs.

    Returns:
        The number of images successfully moved.
    """
    import shutil
    
    # 1. Fetch target set
    from app.crud.set import get_set
    target_set = await get_set(db, move_in.target_set_id)
    if not target_set:
        raise ValueError("Target set not found")
        
    target_path = Path(target_set.local_path) if target_set.local_path else None
    if target_path and not target_path.exists():
        target_path.mkdir(parents=True, exist_ok=True)
        
    # 2. Fetch images to move
    result = await db.execute(
        select(Image).where(Image.id.in_(move_in.image_ids))
    )
    db_images = result.scalars().all()
    
    if not db_images:
        return 0
        
    moved_count = 0
    for img in db_images:
        # Skip if already in the target set
        if img.set_id == target_set.id:
            continue
            
        old_p = Path(img.local_path) if img.local_path else None
        
        # If target has a path and image has a path, move physically
        if target_path and old_p:
            new_p = target_path / old_p.name
            
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
                    continue
            elif new_p.exists():
                img.local_path = str(new_p)
                
        # Update DB
        img.set_id = target_set.id
        db.add(img)
        moved_count += 1
        
    await db.commit()
    return moved_count
