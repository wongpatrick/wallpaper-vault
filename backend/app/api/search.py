"""
API endpoints for global fuzzy search across Sets, Creators, Characters, Franchises, and Tags.
"""
from typing import List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.set import Set
from app.models.creator import Creator
from app.models.character import Character
from app.models.franchise import Franchise
from app.models.tag import Tag
from app.models.associations import set_creators, set_characters, set_tags
from app.schemas.search import SearchResultItem

router = APIRouter()

@router.get("", response_model=List[SearchResultItem])
async def search_all(
    q: str = Query(..., min_length=1, description="The search term"),
    db: AsyncSession = Depends(get_db)
) -> List[SearchResultItem]:
    """
    Search for potential matches across Sets, Creators, Characters, Franchises, and Tags.
    Sorts matches starting with the search query first, followed by substring matches.
    """
    results = []

    # 1. Search Sets
    set_stmt = (
        select(Set)
        .options(selectinload(Set.creators))
        .where(Set.title.icontains(q))
        .order_by(
            case(
                (func.lower(Set.title).like(func.lower(q) + "%"), 0),
                else_=1
            ),
            func.lower(Set.title).asc()
        )
        .limit(5)
    )
    set_result = await db.execute(set_stmt)
    for s in set_result.scalars().all():
        creator_str = " & ".join(c.canonical_name for c in s.creators) if s.creators else "Unknown"
        results.append(SearchResultItem(
            id=s.id,
            name=s.title or "Untitled Set",
            type="set",
            detail=creator_str
        ))

    # 2. Search Creators
    creator_stmt = (
        select(Creator, func.count(set_creators.c.set_id).label("set_count"))
        .outerjoin(set_creators, Creator.id == set_creators.c.creator_id)
        .where(Creator.canonical_name.icontains(q))
        .group_by(Creator.id)
        .order_by(
            case(
                (func.lower(Creator.canonical_name).like(func.lower(q) + "%"), 0),
                else_=1
            ),
            func.count(set_creators.c.set_id).desc(),
            func.lower(Creator.canonical_name).asc()
        )
        .limit(5)
    )
    creator_result = await db.execute(creator_stmt)
    for row in creator_result.all():
        c = row.Creator
        count = row.set_count
        detail_str = f"{count} set" if count == 1 else f"{count} sets"
        results.append(SearchResultItem(
            id=c.id,
            name=c.canonical_name,
            type="creator",
            detail=detail_str
        ))

    # 3. Search Characters
    char_stmt = (
        select(Character)
        .options(selectinload(Character.franchise))
        .where(Character.name.icontains(q))
        .order_by(
            case(
                (func.lower(Character.name).like(func.lower(q) + "%"), 0),
                else_=1
            ),
            func.lower(Character.name).asc()
        )
        .limit(5)
    )
    char_result = await db.execute(char_stmt)
    for char in char_result.scalars().all():
        franchise_name = char.franchise.name if char.franchise else "Original"
        results.append(SearchResultItem(
            id=char.id,
            name=char.name,
            type="character",
            detail=franchise_name
        ))

    # 4. Search Franchises
    franchise_stmt = (
        select(Franchise, func.count(set_characters.c.set_id.distinct()).label("set_count"))
        .outerjoin(Character, Franchise.id == Character.franchise_id)
        .outerjoin(set_characters, Character.id == set_characters.c.character_id)
        .where(Franchise.name.icontains(q))
        .group_by(Franchise.id)
        .order_by(
            case(
                (func.lower(Franchise.name).like(func.lower(q) + "%"), 0),
                else_=1
            ),
            func.count(set_characters.c.set_id.distinct()).desc(),
            func.lower(Franchise.name).asc()
        )
        .limit(5)
    )
    franchise_result = await db.execute(franchise_stmt)
    for row in franchise_result.all():
        f = row.Franchise
        count = row.set_count
        detail_str = f"{count} set" if count == 1 else f"{count} sets"
        results.append(SearchResultItem(
            id=f.id,
            name=f.name,
            type="franchise",
            detail=detail_str
        ))

    # 5. Search Tags
    tag_stmt = (
        select(Tag, func.count(set_tags.c.set_id).label("set_count"))
        .outerjoin(set_tags, Tag.id == set_tags.c.tag_id)
        .where(Tag.name.icontains(q))
        .group_by(Tag.id)
        .order_by(
            case(
                (func.lower(Tag.name).like(func.lower(q) + "%"), 0),
                else_=1
            ),
            func.count(set_tags.c.set_id).desc(),
            func.lower(Tag.name).asc()
        )
        .limit(5)
    )
    tag_result = await db.execute(tag_stmt)
    for row in tag_result.all():
        t = row.Tag
        count = row.set_count
        detail_str = f"{count} set" if count == 1 else f"{count} sets"
        results.append(SearchResultItem(
            id=t.id,
            name=t.name,
            type="tag",
            detail=detail_str
        ))

    return results
