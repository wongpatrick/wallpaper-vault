from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from app.models.image import Image
from app.models.set import Set
from app.models.creator import Creator
from app.schemas.image import ImageUpdate, ImageCreate
import os
from pathlib import Path
from collections import defaultdict

async def get_random_image(
    db: AsyncSession, 
    tags: Optional[list[str]] = None, 
    aspect_ratio_label: Optional[str] = None,
    min_width: Optional[int] = None,
    min_height: Optional[int] = None,
    creator_id: Optional[int] = None
) -> Optional[Image]:
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
    result = await db.execute(select(Image).filter(Image.id == image_id))
    return result.scalar_one_or_none()

async def get_images_by_set(db: AsyncSession, set_id: int) -> list[Image]:
    result = await db.execute(select(Image).filter(Image.set_id == set_id).order_by(Image.sort_order))
    return list(result.scalars().all())

async def create_image(db: AsyncSession, image_in: ImageCreate, set_id: int) -> Image:
    db_image = Image(**image_in.model_dump(), set_id=set_id)
    db.add(db_image)
    await db.commit()
    await db.refresh(db_image)
    return db_image

async def update_image(db: AsyncSession, image_id: int, image_in: ImageUpdate) -> Optional[Image]:
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

async def delete_image(db: AsyncSession, image_id: int) -> Optional[Image]:
    db_image = await get_image(db, image_id)
    if db_image:
        await db.delete(db_image)
        await db.commit()
    return db_image

async def get_duplicate_groups(db: AsyncSession):
    # 1. Find phashe that appear more than once
    subquery = (
        select(Image.phash)
        .filter(Image.phash != None)
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

async def resolve_duplicates(db: AsyncSession, keep_id: int, remove_ids: List[int]):
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
                    print(f"Error deleting file {p}: {e}")
            
            # Delete DB record
            await db.delete(db_image)
            removed_count += 1
    
    await db.commit()
    return removed_count, space_saved
