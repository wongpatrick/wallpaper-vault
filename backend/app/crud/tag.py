"""
CRUD operations for retrieving and managing normalized tags.
"""
from typing import Optional, List, Sequence
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from app.models.tag import Tag
from app.models.associations import set_tags
from app.models.character import Character
from app.models.franchise import Franchise
import structlog

logger = structlog.get_logger(__name__)

async def get_unique_tags(
    db: AsyncSession, 
    search: Optional[str] = None, 
    limit: int = 50
) -> Sequence[str]:
    """Fetches unique tags.

    Args:
        db: Database session.
        search: Optional string to filter tags by (case-insensitive).
        limit: Maximum number of tags to return.

    Returns:
        A sorted list of unique tag strings.
    """
    stmt = select(Tag.name)
    if search:
        stmt = stmt.filter(Tag.name.icontains(search))
    stmt = stmt.order_by(Tag.name.asc()).limit(limit)
    
    result = await db.execute(stmt)
    return result.scalars().all()

async def get_tag_cloud(
    db: AsyncSession,
    limit: int = 50
) -> List[dict]:
    """Returns the top N tags, characters, and franchises by frequency across sets."""
    from app.models.associations import set_characters
    
    # Query Tags
    tag_stmt = (
        select(
            Tag.name,
            func.count(set_tags.c.set_id).label("count")
        )
        .join(set_tags, Tag.id == set_tags.c.tag_id)
        .group_by(Tag.id)
        .order_by(func.count(set_tags.c.set_id).desc())
        .limit(limit)
    )
    
    # Query Characters
    char_stmt = (
        select(
            Character.name,
            func.count(set_characters.c.set_id).label("count")
        )
        .join(set_characters, Character.id == set_characters.c.character_id)
        .group_by(Character.id)
        .order_by(func.count(set_characters.c.set_id).desc())
        .limit(limit)
    )
    
    # Query Franchises
    franchise_stmt = (
        select(
            Franchise.name,
            func.count(set_characters.c.set_id.distinct()).label("count")
        )
        .join(Character, Franchise.id == Character.franchise_id)
        .join(set_characters, Character.id == set_characters.c.character_id)
        .group_by(Franchise.id)
        .order_by(func.count(set_characters.c.set_id.distinct()).desc())
        .limit(limit)
    )

    tag_res = await db.execute(tag_stmt)
    char_res = await db.execute(char_stmt)
    fran_res = await db.execute(franchise_stmt)
    
    items = []
    for row in tag_res.all():
        items.append({"tag": row.name, "type": "tag", "count": row.count})
    for row in char_res.all():
        items.append({"tag": row.name, "type": "character", "count": row.count})
    for row in fran_res.all():
        items.append({"tag": row.name, "type": "franchise", "count": row.count})
        
    # Sort all combined items by count descending, then take top N
    items.sort(key=lambda x: (-x["count"], x["tag"]))
    return items[:limit]

async def get_or_create_tag(db: AsyncSession, name: str) -> Tag:
    """
    Get an existing tag or create a new one.
    Enforces Title Case and prevents collision with Characters/Franchises.
    """
    name = name.strip()
    if not name:
        raise ValueError("Tag name cannot be empty.")
        
    # 1. Enforce Title Case (or known overrides)
    special = {"cny": "Cny", "ol": "Ol", "kpop": "Kpop"}
    lower_name = name.lower()
    if lower_name in special:
        normalized_name = special[lower_name]
    else:
        normalized_name = name.title()
        
    # 2. Check for collision with characters or franchises
    char_exists = await db.execute(select(Character.id).filter(func.lower(Character.name) == lower_name))
    if char_exists.first():
        raise ValueError(f"Cannot create tag '{normalized_name}': A character with this name already exists.")
        
    franchise_exists = await db.execute(select(Franchise.id).filter(func.lower(Franchise.name) == lower_name))
    if franchise_exists.first():
        raise ValueError(f"Cannot create tag '{normalized_name}': A franchise with this name already exists.")

    # 3. Check for existing tag
    stmt = select(Tag).filter(func.lower(Tag.name) == lower_name)
    result = await db.execute(stmt)
    existing_tag = result.scalars().first()
    if existing_tag:
        return existing_tag
        
    # 4. Create new tag
    new_tag = Tag(name=normalized_name)
    db.add(new_tag)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        # In case of race condition, try fetching again
        result = await db.execute(stmt)
        existing_tag = result.scalars().first()
        if existing_tag:
            return existing_tag
        raise # Reraise if it wasn't a simple race condition
        
    return new_tag

async def get_tags_by_names(db: AsyncSession, names: List[str]) -> List[Tag]:
    """
    Helper to resolve a list of string names into Tag models.
    Creates them if they don't exist.
    """
    tags = []
    for name in names:
        if name.strip():
            try:
                tag = await get_or_create_tag(db, name)
                tags.append(tag)
            except ValueError as e:
                logger.info("Skipping tag creation/association due to character/franchise name collision", name=name, error=str(e))
    return tags

async def get_tags(db: AsyncSession, skip: int = 0, limit: int = 100) -> List[dict]:
    """Retrieve all tags with set counts."""
    stmt = (
        select(Tag, func.count(set_tags.c.set_id).label("set_count"))
        .outerjoin(set_tags, Tag.id == set_tags.c.tag_id)
        .group_by(Tag.id)
        .order_by(Tag.name.asc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return [{"id": row.Tag.id, "name": row.Tag.name, "set_count": row.set_count} for row in result.all()]

async def get_tag(db: AsyncSession, tag_id: int) -> Optional[Tag]:
    """Retrieve a tag by ID."""
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    return result.scalars().first()

async def update_tag(db: AsyncSession, tag_id: int, name: str) -> Optional[Tag]:
    """Update a tag's name."""
    db_tag = await get_tag(db, tag_id)
    if not db_tag:
        return None
        
    name = name.strip()
    if not name:
        raise ValueError("Tag name cannot be empty.")
        
    # Enforce Title Case
    special = {"cny": "Cny", "ol": "Ol", "kpop": "Kpop"}
    lower_name = name.lower()
    if lower_name in special:
        normalized_name = special[lower_name]
    else:
        normalized_name = name.title()
        
    # Check for collision with characters or franchises
    char_exists = await db.execute(select(Character.id).filter(func.lower(Character.name) == lower_name))
    if char_exists.first():
        raise ValueError(f"Cannot update tag to '{normalized_name}': A character with this name already exists.")
        
    franchise_exists = await db.execute(select(Franchise.id).filter(func.lower(Franchise.name) == lower_name))
    if franchise_exists.first():
        raise ValueError(f"Cannot update tag to '{normalized_name}': A franchise with this name already exists.")

    # Check for existing tag collision
    stmt = select(Tag).filter(func.lower(Tag.name) == lower_name, Tag.id != tag_id)
    existing_tag = await db.execute(stmt)
    if existing_tag.first():
        raise ValueError(f"Cannot update tag to '{normalized_name}': A tag with this name already exists.")

    db_tag.name = normalized_name
    await db.commit()
    await db.refresh(db_tag)
    return db_tag

async def delete_tag(db: AsyncSession, tag_id: int) -> bool:
    """Delete a tag."""
    db_tag = await get_tag(db, tag_id)
    if not db_tag:
        return False
    await db.delete(db_tag)
    await db.commit()
    return True

async def merge_tags(db: AsyncSession, source_ids: list[int], target_id: int) -> Optional[Tag]:
    """Merges multiple source tags into a single target tag.

    Re-associates all sets from the source tags to the target tag,
    and deletes the source tags.
    """
    from sqlalchemy.orm import selectinload
    from app.models.set import Set
    from app.models.image import Image
    target = await db.execute(
        select(Tag)
        .options(
            selectinload(Tag.sets).selectinload(Set.tags),
            selectinload(Tag.images).selectinload(Image.tags)
        )
        .where(Tag.id == target_id)
    )
    target = target.scalars().first()
    if not target:
        return None

    for sid in source_ids:
        source = await db.execute(
            select(Tag)
            .options(
                selectinload(Tag.sets).selectinload(Set.tags),
                selectinload(Tag.images).selectinload(Image.tags)
            )
            .where(Tag.id == sid)
        )
        source = source.scalars().first()
        if not source:
            continue
            
        for s in list(source.sets):
            if target not in s.tags:
                s.tags.append(target)
            if source in s.tags:
                s.tags.remove(source)
                
        for img in list(source.images):
            if target not in img.tags:
                img.tags.append(target)
            if source in img.tags:
                img.tags.remove(source)
                
        await db.delete(source)
        
    await db.commit()
    await db.refresh(target)
    return await get_tag(db, target_id)
