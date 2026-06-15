"""CRUD operations for characters."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
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
    from app.models.associations import set_characters
    stmt = (
        select(Character, func.count(set_characters.c.set_id).label("set_count"))
        .options(selectinload(Character.franchise))
        .outerjoin(set_characters, Character.id == set_characters.c.character_id)
        .group_by(Character.id)
        .offset(skip).limit(limit)
    )
    result = await db.execute(stmt)
    
    return [
        {
            "id": row.Character.id, 
            "name": row.Character.name, 
            "franchise_id": row.Character.franchise_id,
            "franchise": row.Character.franchise,
            "set_count": row.set_count
        } for row in result.all()
    ]

async def get_character_by_name(db: AsyncSession, name: str) -> Optional[Character]:
    result = await db.execute(
        select(Character)
        .options(selectinload(Character.franchise))
        .where(func.lower(Character.name) == name.lower())
    )
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
    name = name.strip().title()
    
    # Check if character already exists
    existing = await get_character_by_name(db, name)
    if existing:
        return existing

    import re
    match = re.match(r"^(.*?)\s*\((.*?)\)$", name)
    if match:
        base_name = match.group(1).strip()
        franchise_name = match.group(2).strip()
        
        # Check if character with base name already exists
        existing = await get_character_by_name(db, base_name)
        if existing:
            # If the existing character doesn't have a franchise associated, link it
            if not existing.franchise_id:
                from app.crud.franchise import get_or_create_franchise
                franchise = await get_or_create_franchise(db, franchise_name)
                existing.franchise = franchise
                db.add(existing)
                await db.flush()
            return existing
            
        # Create new character with the base name and associated franchise
        from app.crud.franchise import get_or_create_franchise
        franchise = await get_or_create_franchise(db, franchise_name)
        db_character = Character(name=base_name, franchise=franchise)
    else:
        # Create new character with no franchise by default
        db_character = Character(name=name)
        
    db.add(db_character)
    try:
        await db.flush()
        await _auto_migrate_tag(db, db_character)
        await db.flush()
    except IntegrityError:
        await db.rollback()
        check_name = base_name if match else name
        existing = await get_character_by_name(db, check_name)
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

async def merge_characters(db: AsyncSession, source_ids: list[int], target_id: int) -> Optional[Character]:
    """Merges multiple source characters into a single target character.

    Re-associates all sets from the source characters to the target character,
    and deletes the source characters.
    """
    target = await db.execute(
        select(Character)
        .options(selectinload(Character.sets).selectinload(Set.characters))
        .where(Character.id == target_id)
    )
    target = target.scalars().first()
    if not target:
        return None

    for sid in source_ids:
        source = await db.execute(
            select(Character)
            .options(selectinload(Character.sets).selectinload(Set.characters))
            .where(Character.id == sid)
        )
        source = source.scalars().first()
        if not source:
            continue
            
        for s in list(source.sets):
            if target not in s.characters:
                s.characters.append(target)
            if source in s.characters:
                s.characters.remove(source)
                
        await db.delete(source)
        
    await db.commit()
    await db.refresh(target)
    return await get_character(db, target_id)
