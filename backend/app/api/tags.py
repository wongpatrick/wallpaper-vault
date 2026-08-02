"""
API endpoints for searching and retrieving tags.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.api.deps import PaginationParams, pagination_params
from app.crud import tag as crud_tag
from app.schemas.tag import Tag, TagUpdate, TagMerge, TagPage

from app.schemas.bulk import BulkDeleteRequest

router = APIRouter()


class TagCount(BaseModel):
    """Represents a tag, character, or franchise and its usage count."""
    tag: str
    type: str = "tag" # "tag", "character", "franchise"
    count: int


@router.get("/cloud", response_model=List[TagCount])
async def read_tag_cloud(
    limit: int = Query(50, ge=1, le=500, description="Maximum number of tags to return, sorted by frequency"),
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
    limit: int = Query(50, ge=1, le=500, description="Maximum number of tags to return"),
    db: AsyncSession = Depends(get_db)
) -> List[str]:
    """
    Retrieve a list of unique tags matching the search query.
    
    Aggregates tags from both Images and Sets, returning a deduplicated, alphabetically sorted list. Useful for building autocomplete dropdowns or tag clouds in the UI.
    """
    tags = await crud_tag.get_unique_tags(db, search=q, limit=limit)
    return tags

@router.get("/management", response_model=TagPage)
async def read_tags_management(
    search: Optional[str] = Query(None, description="Search term for tag name"),
    sort_by: Optional[str] = Query(None, description="Field to sort by (name, set_count, image_count)"),
    sort_dir: Optional[str] = Query(None, description="Sort direction (asc, desc)"),
    pagination: PaginationParams = Depends(pagination_params),
    db: AsyncSession = Depends(get_db)
) -> TagPage:
    """Retrieve full tag objects for management UI with pagination."""
    tags = await crud_tag.get_tags(
        db, 
        search=search, 
        sort_by=sort_by, 
        sort_dir=sort_dir, 
        skip=pagination.skip, 
        limit=pagination.limit
    )
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
        await db.commit()
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
    await db.commit()
    return None

@router.post("/bulk-delete", status_code=status.HTTP_204_NO_CONTENT)
async def bulk_delete_tags(
    request: BulkDeleteRequest,
    db: AsyncSession = Depends(get_db)
):
    """Bulk delete multiple tags."""
    await crud_tag.bulk_delete_tags(db, request.ids)
    await db.commit()
    return None


@router.post("/merge", response_model=Tag)
async def merge_tags(
    merge_in: TagMerge,
    db: AsyncSession = Depends(get_db)
):
    """Merge multiple tags into one."""
    if merge_in.target_id in merge_in.source_ids:
        raise HTTPException(status_code=400, detail="Cannot merge a tag into itself")
        
    db_tag = await crud_tag.merge_tags(
        db, 
        source_ids=merge_in.source_ids, 
        target_id=merge_in.target_id
    )
    if not db_tag:
        raise HTTPException(status_code=404, detail="Target tag not found")
        
    await db.commit()
    return db_tag
