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
from app.schemas.image import ImageUpdate, ImageCreate, ImageBulkUpdate
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
            # Delete file
            p = Path(db_image.local_path)
            if p.exists():
                space_saved += p.stat().st_size
                try:
                    os.unlink(p)
                except Exception as e:
                    logger.error("Error deleting file", path=str(p), error=str(e), exc_info=True)
            
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
    rating: Optional[str] = None
) -> tuple[List[Image], int]:
    """Retrieves a paginated list of images, optionally filtered by search terms or rating.

    Args:
        db: Database session.
        skip: Number of records to skip (for pagination).
        limit: Maximum number of records to return.
        search: Optional search term matching filename, set title, tags, or creator name.
        rating: Optional rating to filter by.

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

    # Pagination with relationship loading
    items_query = query.distinct().options(
        selectinload(Image.set).selectinload(Set.creators)
    ).order_by(Image.date_added.desc(), Image.id.desc()).offset(skip).limit(limit)
    
    result = await db.execute(items_query)
    return list(result.scalars().all()), total
