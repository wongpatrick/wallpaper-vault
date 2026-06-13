"""CRUD operations for franchises."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List
from app.models.franchise import Franchise
from app.schemas.franchise import FranchiseCreate, FranchiseUpdate
from app.models.tag import Tag

async def _check_tag_collision(db: AsyncSession, name: str):
    stmt = select(Tag).where(func.lower(Tag.name) == name.lower())
    existing_tag = (await db.execute(stmt)).scalars().first()
    if existing_tag:
        # Auto-migrate: Delete the tag. Sets that had this tag will lose it, 
        # as Sets must be linked to Characters, not Franchises directly.
        await db.delete(existing_tag)
        await db.flush()

async def get_franchise(db: AsyncSession, franchise_id: int) -> Optional[Franchise]:
    result = await db.execute(select(Franchise).where(Franchise.id == franchise_id))
    return result.scalars().first()

async def get_franchises(db: AsyncSession, skip: int = 0, limit: int = 100) -> List[dict]:
    from app.models.character import Character
    from app.models.associations import set_characters
    stmt = (
        select(Franchise, func.count(set_characters.c.set_id.distinct()).label("set_count"))
        .outerjoin(Character, Franchise.id == Character.franchise_id)
        .outerjoin(set_characters, Character.id == set_characters.c.character_id)
        .group_by(Franchise.id)
        .offset(skip).limit(limit)
    )
    result = await db.execute(stmt)
    return [
        {
            "id": row.Franchise.id, 
            "name": row.Franchise.name,
            "set_count": row.set_count
        } for row in result.all()
    ]

async def get_franchise_by_name(db: AsyncSession, name: str) -> Optional[Franchise]:
    result = await db.execute(select(Franchise).where(Franchise.name == name))
    return result.scalars().first()

async def create_franchise(db: AsyncSession, franchise: FranchiseCreate) -> Franchise:
    await _check_tag_collision(db, franchise.name)
    db_franchise = Franchise(name=franchise.name)
    db.add(db_franchise)
    await db.commit()
    await db.refresh(db_franchise)
    return db_franchise

async def update_franchise(db: AsyncSession, franchise_id: int, franchise_in: FranchiseUpdate) -> Optional[Franchise]:
    db_franchise = await get_franchise(db, franchise_id)
    if not db_franchise:
        return None
    if franchise_in.name is not None:
        await _check_tag_collision(db, franchise_in.name)
        db_franchise.name = franchise_in.name
    await db.commit()
    await db.refresh(db_franchise)
    return db_franchise

async def delete_franchise(db: AsyncSession, franchise_id: int) -> bool:
    db_franchise = await get_franchise(db, franchise_id)
    if not db_franchise:
        return False
    await db.delete(db_franchise)
    await db.commit()
    return True
