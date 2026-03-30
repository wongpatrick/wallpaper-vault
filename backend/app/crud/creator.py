from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.creator import Creator
from app.schemas.creator import CreatorCreate

async def get_creator(db: AsyncSession, creator_id: int):
    return await db.get(Creator, creator_id) 

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


async def delete_creator(db: AsyncSession, creator_id: int):
    creator = await get_creator(db, creator_id)
    await db.delete(creator)
    await db.commit()
    return creator