from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.creator import Creator
from app.models.set import Set
from app.schemas.creator import CreatorCreate, CreatorUpdate

async def get_creator(db: AsyncSession, creator_id: int):
    result = await db.execute(
        select(Creator)
        .options(
            selectinload(Creator.sets).selectinload(Set.images),
            selectinload(Creator.sets).selectinload(Set.creators)
        )
        .filter(Creator.id == creator_id)
    )
    return result.scalar_one_or_none()

async def get_creator_by_name(db: AsyncSession, name: str):
    result = await db.execute(
        select(Creator).filter(Creator.canonical_name == name)
    )
    return result.scalar_one_or_none()

async def get_creators(db: AsyncSession, skip: int = 0, limit: int = 100):
    creators = await db.execute(
        select(Creator).offset(skip).limit(limit)
    )
    return list(creators.scalars().all())

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