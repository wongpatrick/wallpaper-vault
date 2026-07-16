"""CRUD operations for characters."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError
from typing import Optional, List, Sequence
from app.models.character import Character
from app.schemas.character import CharacterCreate, CharacterUpdate
from app.models.tag import Tag
from app.models.set import Set
from app.models.associations import set_tags

async def _auto_migrate_tag(db: AsyncSession, character: Character):
    """
    If a tag exists with the exact same name as this character,
    migrate all Sets from that tag to this character, then delete the tag.
    """
    stmt = select(Tag).where(func.lower(Tag.name) == character.name.lower())
    existing_tag = (await db.execute(stmt)).scalars().first()
    
    if existing_tag:
        # Fetch all Sets that have this tag
        set_stmt = (
            select(Set)
            .options(selectinload(Set.tags), selectinload(Set.characters))
            .join(set_tags)
            .where(set_tags.c.tag_id == existing_tag.id)
        )
        sets_with_tag = (await db.execute(set_stmt)).scalars().all()
        
        for s in sets_with_tag:
            if existing_tag in s.tags:
                s.tags.remove(existing_tag)
            if character not in s.characters:
                s.characters.append(character)
                
        await db.delete(existing_tag)

async def get_character(db: AsyncSession, character_id: int) -> Optional[Character]:
    result = await db.execute(
        select(Character)
        .options(selectinload(Character.franchise))
        .where(Character.id == character_id)
    )
    return result.scalars().first()

async def get_characters(db: AsyncSession, skip: int = 0, limit: int = 100) -> List[dict]:
    from app.models.associations import set_characters, image_characters
    stmt = (
        select(
            Character,
            func.count(set_characters.c.set_id.distinct()).label("set_count"),
            func.count(image_characters.c.image_id.distinct()).label("image_count")
        )
        .options(selectinload(Character.franchise))
        .outerjoin(set_characters, Character.id == set_characters.c.character_id)
        .outerjoin(image_characters, Character.id == image_characters.c.character_id)
        .group_by(Character.id)
        .order_by(func.count(set_characters.c.set_id.distinct()).desc(), Character.name.asc())
        .offset(skip).limit(limit)
    )
    result = await db.execute(stmt)
    
    return [
        {
            "id": row.Character.id, 
            "name": row.Character.name, 
            "franchise_id": row.Character.franchise_id,
            "franchise": row.Character.franchise,
            "set_count": row.set_count,
            "image_count": row.image_count
        } for row in result.all()
    ]

async def get_character_by_name(db: AsyncSession, name: str) -> Optional[Character]:
    result = await db.execute(
        select(Character)
        .options(selectinload(Character.franchise))
        .where(func.lower(Character.name) == name.lower())
    )
    return result.scalars().first()

async def get_character_by_name_and_franchise_id(db: AsyncSession, name: str, franchise_id: Optional[int] = None) -> Optional[Character]:
    stmt = select(Character).options(selectinload(Character.franchise)).where(
        func.lower(Character.name) == name.lower()
    )
    if franchise_id is not None:
        stmt = stmt.where(Character.franchise_id == franchise_id)
    else:
        stmt = stmt.where(Character.franchise_id.is_(None))
    result = await db.execute(stmt)
    return result.scalars().first()

async def get_character_by_name_and_franchise_name(db: AsyncSession, name: str, franchise_name: Optional[str] = None) -> Optional[Character]:
    stmt = select(Character).options(selectinload(Character.franchise))
    if franchise_name:
        from app.models.franchise import Franchise
        stmt = stmt.join(Character.franchise).where(
            func.lower(Character.name) == name.lower(),
            func.lower(Franchise.name) == franchise_name.lower()
        )
    else:
        stmt = stmt.where(
            func.lower(Character.name) == name.lower(),
            Character.franchise_id.is_(None)
        )
    result = await db.execute(stmt)
    return result.scalars().first()

async def get_characters_by_names(db: AsyncSession, names: list[str]) -> Sequence[Character]:
    characters = []
    for name in names:
        if name.strip():
            char = await get_or_create_character(db, name)
            characters.append(char)
    return characters

async def get_or_create_character(db: AsyncSession, name: str) -> Character:
    # Basic Title Case processing
    name = name.strip()
    
    import re
    match = re.match(r"^(.*?)\s*\((.*?)\)$", name)
    if match:
        base_name = match.group(1).strip().title()
        franchise_name = match.group(2).strip().title()
        
        # 1. Check if character with base name and franchise name already exists
        existing = await get_character_by_name_and_franchise_name(db, base_name, franchise_name)
        if existing:
            return existing
            
        # 2. Check if a franchise-less character with the same name exists, and upgrade it if so
        existing_no_franchise = await get_character_by_name_and_franchise_id(db, base_name, None)
        if existing_no_franchise:
            from app.crud.franchise import get_or_create_franchise
            franchise = await get_or_create_franchise(db, franchise_name)
            existing_no_franchise.franchise = franchise
            db.add(existing_no_franchise)
            await db.flush()
            return existing_no_franchise
            
        # Create new character with the base name and associated franchise
        from app.crud.franchise import get_or_create_franchise
        franchise = await get_or_create_franchise(db, franchise_name)
        db_character = Character(name=base_name, franchise=franchise)
    else:
        # Check if character with name and no franchise already exists
        base_name = name.title()
        existing = await get_character_by_name_and_franchise_id(db, base_name, None)
        if existing:
            return existing
            
        db_character = Character(name=base_name)
        
    db.add(db_character)
    try:
        await db.flush()
        await _auto_migrate_tag(db, db_character)
        await db.flush()
    except IntegrityError:
        await db.rollback()
        # Fallback check
        check_name = base_name
        check_franchise = franchise_name if match else None
        if match:
            existing = await get_character_by_name_and_franchise_name(db, check_name, check_franchise)
        else:
            existing = await get_character_by_name_and_franchise_id(db, check_name, None)
        if existing:
            return existing
        raise
        
    return db_character

async def create_character(db: AsyncSession, character: CharacterCreate) -> Character:
    db_character = Character(
        name=character.name.strip().title(),
        franchise_id=character.franchise_id
    )
    db.add(db_character)
    await db.flush()
    await _auto_migrate_tag(db, db_character)
    await db.commit()
    await db.refresh(db_character)
    return await get_character(db, db_character.id)

async def update_character(db: AsyncSession, character_id: int, character_in: CharacterUpdate) -> Optional[Character]:
    db_character = await get_character(db, character_id)
    if not db_character:
        return None
    if character_in.name is not None:
        db_character.name = character_in.name.strip().title()
    if character_in.franchise_id is not None:
        db_character.franchise_id = character_in.franchise_id
    
    await _auto_migrate_tag(db, db_character)
    await db.commit()
    await db.refresh(db_character)
    return await get_character(db, character_id)

async def delete_character(db: AsyncSession, character_id: int) -> bool:
    db_character = await get_character(db, character_id)
    if not db_character:
        return False
    await db.delete(db_character)
    await db.commit()
    return True

async def bulk_delete_characters(db: AsyncSession, ids: list[int]) -> int:
    """Bulk deletes multiple characters by ID and returns the number of deleted records."""
    if not ids:
        return 0
    
    from app.models.associations import set_characters
    
    # 1. Delete associations from set_characters
    await db.execute(
        delete(set_characters).where(set_characters.c.character_id.in_(ids))
    )
    
    # 2. Delete the characters themselves
    result = await db.execute(
        delete(Character).where(Character.id.in_(ids))
    )
    await db.commit()
    return result.rowcount


async def merge_characters(db: AsyncSession, source_ids: list[int], target_id: int) -> Optional[dict]:
    """Merges multiple source characters into a single target character.

    Re-associates all sets from the source characters to the target character,
    and deletes the source characters.
    """
    from sqlalchemy import text
    from app.models.associations import set_characters

    target = await db.execute(
        select(Character)
        .options(selectinload(Character.franchise))
        .where(Character.id == target_id)
    )
    target = target.scalars().first()
    if not target:
        return None

    for sid in source_ids:
        source = await db.execute(
            select(Character).where(Character.id == sid)
        )
        source = source.scalars().first()
        if not source:
            continue

        # Direct SQL: add target to sets that have source but not target
        await db.execute(text(
            "INSERT OR IGNORE INTO set_characters (set_id, character_id) "
            "SELECT set_id, :target_id FROM set_characters WHERE character_id = :source_id"
        ), {"target_id": target_id, "source_id": sid})

        # Direct SQL: remove source from all sets
        await db.execute(text(
            "DELETE FROM set_characters WHERE character_id = :source_id"
        ), {"source_id": sid})

        # Direct SQL: add target to images that have source but not target
        await db.execute(text(
            "INSERT OR IGNORE INTO image_characters (image_id, character_id) "
            "SELECT image_id, :target_id FROM image_characters WHERE character_id = :source_id"
        ), {"target_id": target_id, "source_id": sid})

        # Direct SQL: remove source from all images
        await db.execute(text(
            "DELETE FROM image_characters WHERE character_id = :source_id"
        ), {"source_id": sid})

        await db.flush()
        await db.delete(source)

    await db.commit()

    # Re-query with computed counts so the response is accurate
    from app.models.associations import image_characters
    stmt = (
        select(
            Character, 
            func.count(set_characters.c.set_id.distinct()).label("set_count"),
            func.count(image_characters.c.image_id.distinct()).label("image_count")
        )
        .options(selectinload(Character.franchise))
        .outerjoin(set_characters, Character.id == set_characters.c.character_id)
        .outerjoin(image_characters, Character.id == image_characters.c.character_id)
        .where(Character.id == target_id)
        .group_by(Character.id)
    )
    result = await db.execute(stmt)
    row = result.first()
    if not row:
        return None
    return {
        "id": row.Character.id,
        "name": row.Character.name,
        "franchise_id": row.Character.franchise_id,
        "franchise": row.Character.franchise,
        "set_count": row.set_count,
        "image_count": row.image_count,
    }

