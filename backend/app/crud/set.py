from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.creator import Creator
from app.models.set import Set
from app.schemas.set import SetCreate


async def get_set(db: AsyncSession, set_id: int):
    result = await db.execute(
        select(Set).options(selectinload(Set.creators)).filter(Set.id == set_id)
    )
    return result.scalar_one_or_none()


async def get_sets(db: AsyncSession, skip: int = 0, limit: int = 100):
    sets = await db.execute(
        select(Set)
        .options(selectinload(Set.creators))
        .offset(skip)
        .limit(limit)
    )
    return list(sets.scalars().all())

async def create_set(db: AsyncSession, set_in: SetCreate) -> Set:
    db_set = Set(**set_in.model_dump(exclude={"creator_ids"}))

    if set_in.creator_ids:
        result = await db.execute(
            select(Creator).where(Creator.id.in_(set_in.creator_ids))
        )
        creators = result.scalars().all()
        db_set.creators = list(creators)

    db.add(db_set)
    await db.commit()
    await db.refresh(db_set)
    query = (
        select(Set)
        .options(selectinload(Set.creators))
        .filter(Set.id == db_set.id)
    )
    result = await db.execute(query)
    return result.scalar_one()

async def delete_set(db: AsyncSession, set_id: int):
    set = await get_set(db, set_id)
    await db.delete(set)
    await db.commit()
    return set