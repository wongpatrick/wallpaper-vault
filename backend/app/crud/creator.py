from collections import Counter
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.creator import Creator
from app.models.set import Set
from app.schemas.creator import CreatorCreate, CreatorUpdate, CreatorStats

async def _attach_stats(creator_obj: Creator) -> Creator:
    """Helper to calculate stats for a creator object."""
    images = []
    # Creators might have many sets, each with many images.
    # Note: creator_obj.sets MUST be loaded for this to work.
    for s in creator_obj.sets:
        images.extend(s.images)
    
    # Calculate aspect ratio frequency
    ratios = [img.aspect_ratio_label for img in images if img.aspect_ratio_label]
    primary_ar = Counter(ratios).most_common(1)[0][0] if ratios else "Unknown"
    
    # Get only the first image ID for the avatar
    preview_id = images[0].id if images else None
    
    creator_obj.stats = CreatorStats(
        total_sets=len(creator_obj.sets),
        total_images=len(images),
        total_size_bytes=sum(img.file_size or 0 for img in images),
        primary_aspect_ratio=primary_ar,
        preview_image_id=preview_id
    )
    return creator_obj

async def get_creator(db: AsyncSession, creator_id: int):
    result = await db.execute(
        select(Creator)
        .options(
            selectinload(Creator.sets).selectinload(Set.images),
            selectinload(Creator.sets).selectinload(Set.creators)
        )
        .filter(Creator.id == creator_id)
    )
    creator_obj = result.scalar_one_or_none()
    if creator_obj:
        await _attach_stats(creator_obj)
    return creator_obj

async def get_creator_by_name(db: AsyncSession, name: str):
    result = await db.execute(
        select(Creator).filter(Creator.canonical_name == name)
    )
    return result.scalar_one_or_none()

async def get_creators(db: AsyncSession, skip: int = 0, limit: int = 100, search: Optional[str] = None, creator_type: Optional[str] = None):
    # Base query for creators
    query = select(Creator)
    
    # Apply filters
    if creator_type:
        query = query.filter(Creator.type == creator_type)
    if search:
        query = query.filter(Creator.canonical_name.icontains(search))
    
    # Total count for filtered results
    count_query = select(func.count()).select_from(query.subquery())
    count_result = await db.execute(count_query)
    total = count_result.scalar_one()

    # Final paginated query with relationship loading
    query = query.options(
        selectinload(Creator.sets).selectinload(Set.images)
    ).offset(skip).limit(limit)
    
    result = await db.execute(query)
    creators = list(result.scalars().all())
    for c in creators:
        await _attach_stats(c)
    return creators, total

async def create_creator(db: AsyncSession, creator: CreatorCreate):
    db_creator = Creator(**creator.model_dump())
    db.add(db_creator)
    await db.commit()
    await db.refresh(db_creator)
    return db_creator

async def update_creator(db: AsyncSession, creator_id: int, creator_in: CreatorUpdate):
    db_creator = await db.get(Creator, creator_id)
    if not db_creator:
        return None
    
    update_data = creator_in.model_dump(exclude_unset=True)
    for field in update_data:
        setattr(db_creator, field, update_data[field])
    
    db.add(db_creator)
    await db.commit()
    await db.refresh(db_creator)
    return await get_creator(db, creator_id)

async def delete_creator(db: AsyncSession, creator_id: int):
    db_creator = await db.get(Creator, creator_id)
    if db_creator:
        await db.delete(db_creator)
        await db.commit()
    return db_creator

async def merge_creators(db: AsyncSession, source_id: int, target_id: int):
    # Load source with its sets
    source = await get_creator(db, source_id)
    # Load target (with sets to ensure we don't duplicate associations)
    target = await get_creator(db, target_id)
    
    if not source or not target:
        return None
        
    # Re-associate all sets from source to target
    for s in source.sets:
        if target not in s.creators:
            s.creators.append(target)
            
    # Delete the source creator (SQLAlchemy handles many-to-many cleanup)
    await db.delete(source)
    await db.commit()
    await db.refresh(target)
    
    return target
