"""
API endpoints for searching and retrieving tags.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.crud import tag as crud_tag
from app.schemas.tag import Tag, TagUpdate

router = APIRouter()


class TagCount(BaseModel):
    """Represents a tag, character, or franchise and its usage count."""
    tag: str
    type: str = "tag" # "tag", "character", "franchise"
    count: int


@router.get("/cloud", response_model=List[TagCount])
async def read_tag_cloud(
    limit: int = Query(50, description="Maximum number of tags to return, sorted by frequency"),
    db: AsyncSession = Depends(get_db)
) -> List[TagCount]:
    """
    Retrieve the most frequently used tags across the entire vault.

    Aggregates tags from both Images and Sets, counts occurrences, and returns
    the top N tags sorted by frequency (highest first). Designed to power
    the tag word cloud on the Dashboard.
    """
    tag_counts = await crud_tag.get_tag_cloud(db, limit=limit)
    return [TagCount(**tc) for tc in tag_counts]


@router.get("/", response_model=List[str])
async def search_tags(
    q: Optional[str] = Query(None, description="Prefix or keyword to search for in tags"),
    limit: int = Query(50, description="Maximum number of tags to return"),
    db: AsyncSession = Depends(get_db)
) -> List[str]:
    """
    Retrieve a list of unique tags matching the search query.
    
    Aggregates tags from both Images and Sets, returning a deduplicated, alphabetically sorted list. Useful for building autocomplete dropdowns or tag clouds in the UI.
    """
    tags = await crud_tag.get_unique_tags(db, search=q, limit=limit)
    return tags

@router.get("/management", response_model=List[Tag])
async def read_tags_management(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
) -> List[Tag]:
    """Retrieve full tag objects for management UI."""
    tags = await crud_tag.get_tags(db, skip=skip, limit=limit)
    return tags

@router.patch("/{tag_id}", response_model=Tag)
async def update_tag(
    tag_id: int,
    tag_in: TagUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Rename a tag."""
    try:
        tag = await crud_tag.update_tag(db, tag_id, tag_in.name)
        if not tag:
            raise HTTPException(status_code=404, detail="Tag not found.")
        return tag
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    tag_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Delete a tag."""
    success = await crud_tag.delete_tag(db, tag_id)
    if not success:
        raise HTTPException(status_code=404, detail="Tag not found.")
    return None
