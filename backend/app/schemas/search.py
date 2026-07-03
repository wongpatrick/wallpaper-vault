"""
Pydantic schemas for the global search API.
Defines the structure of search result items returned to the frontend.
"""
from typing import Optional, Union
from pydantic import BaseModel, Field

class SearchResultItem(BaseModel):
    """A single matched item in the global fuzzy search results."""
    id: Union[int, str] = Field(..., description="Unique ID of the matched record.")
    name: str = Field(..., description="Main name or title of the matched item.")
    type: str = Field(..., description="Entity type: set, creator, character, franchise, or tag.")
    detail: Optional[str] = Field(None, description="Contextual metadata (e.g. set count or creator name).")
