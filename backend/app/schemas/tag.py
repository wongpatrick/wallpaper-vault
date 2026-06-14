"""Schemas for tags."""
from pydantic import BaseModel, ConfigDict, Field

class TagBase(BaseModel):
    name: str = Field(..., description="The name of the tag.")

class TagCreate(TagBase):
    pass

class TagUpdate(BaseModel):
    name: str = Field(..., description="The updated name of the tag.")

class Tag(TagBase):
    id: int = Field(..., description="Unique database identifier for the tag.")
    set_count: int = Field(0, description="Number of sets associated with this tag.")
    
    model_config = ConfigDict(from_attributes=True)

class TagMerge(BaseModel):
    source_ids: list[int] = Field(..., description="List of tag IDs to merge and delete.")
    target_id: int = Field(..., description="The ID of the tag to merge into.")
