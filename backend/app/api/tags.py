"""
API endpoints for searching and retrieving tags.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.crud import tag as crud_tag

router = APIRouter()

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
