from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.image import Image
from app.models.set import Set

async def get_unique_tags(
    db: AsyncSession, 
    search: Optional[str] = None, 
    limit: int = 50
) -> List[str]:
    """
    Fetch unique tags from both Images and Sets.
    Tags are stored as space-separated strings in the database.
    """
    image_tags_query = select(Image.tags).filter(Image.tags.is_not(None), Image.tags != "")
    set_tags_query = select(Set.tags).filter(Set.tags.is_not(None), Set.tags != "")
    
    if search:
        image_tags_query = image_tags_query.filter(Image.tags.icontains(search))
        set_tags_query = set_tags_query.filter(Set.tags.icontains(search))
        
    image_res = await db.execute(image_tags_query)
    set_res = await db.execute(set_tags_query)
    
    unique_tags = set()
    for row_tags in image_res.scalars():
        unique_tags.update(row_tags.split())
    for row_tags in set_res.scalars():
        unique_tags.update(row_tags.split())
        
    if search:
        search_lower = search.lower()
        matched = [t for t in unique_tags if search_lower in t.lower()]
    else:
        matched = list(unique_tags)
        
    matched.sort()
    return matched[:limit]
