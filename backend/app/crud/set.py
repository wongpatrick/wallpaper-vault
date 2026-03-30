from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.creator import Creator
from app.models.set import Set
from app.models.image import Image
from app.schemas.set import SetCreate, SetImport
from app.crud.creator import get_creator_by_name, create_creator
from app.schemas.creator import CreatorCreate


async def get_set(db: AsyncSession, set_id: int):
    result = await db.execute(
        select(Set).options(
            selectinload(Set.creators),
            selectinload(Set.images)
        ).filter(Set.id == set_id)
    )
    return result.scalar_one_or_none()


async def get_sets(db: AsyncSession, skip: int = 0, limit: int = 100):
    sets = await db.execute(
        select(Set)
        .options(
            selectinload(Set.creators),
            selectinload(Set.images)
        )
        .offset(skip)
        .limit(limit)
    )
    return list(sets.scalars().all())

async def create_set(db: AsyncSession, set_in: SetCreate) -> Set:
    db_set = Set(**set_in.model_dump(exclude={"creator_ids", "images"}))

    if set_in.creator_ids:
        result = await db.execute(
            select(Creator).where(Creator.id.in_(set_in.creator_ids))
        )
        creators = result.scalars().all()
        db_set.creators = list(creators)
    
    if set_in.images:
        db_set.images = [Image(**image.model_dump()) for image in set_in.images]

    db.add(db_set)
    await db.commit()
    await db.refresh(db_set)
    query = (
        select(Set)
        .options(
            selectinload(Set.creators),
            selectinload(Set.images)
        )
        .filter(Set.id == db_set.id)
    )
    result = await db.execute(query)
    return result.scalar_one()

async def get_set_by_title_and_creator(db: AsyncSession, title: str, creator_id: int):
    result = await db.execute(
        select(Set)
        .join(Set.creators)
        .filter(Set.title == title)
        .filter(Creator.id == creator_id)
    )
    return result.scalar_one_or_none()

async def import_set(db: AsyncSession, set_in: SetImport) -> Set:
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
        db_set.images = [Image(**image.model_dump()) for image in set_in.images]

    db.add(db_set)
    await db.commit()
    await db.refresh(db_set)
    
    query = (
        select(Set)
        .options(
            selectinload(Set.creators),
            selectinload(Set.images)
        )
        .filter(Set.id == db_set.id)
    )
    result = await db.execute(query)
    return result.scalar_one()

async def delete_set(db: AsyncSession, set_id: int):
    set = await get_set(db, set_id)
    await db.delete(set)
    await db.commit()
    return set