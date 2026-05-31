"""
Pydantic schemas for creator entities.
Defines models for creating, updating, and returning creator data and statistics.
"""
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field

class CreatorBase(BaseModel):
    canonical_name: str = Field(..., description="The primary, normalized name of the artist/creator.")
    type: Optional[str] = Field(None, description="Type of creator (e.g., 'photographer', 'illustrator', 'cosplayer').")
    notes: Optional[str] = Field(None, description="User-provided notes or biography for the creator.")

class CreatorCreate(CreatorBase):
    pass

class CreatorUpdate(CreatorBase):
    canonical_name: Optional[str] = Field(None, description="The primary, normalized name of the artist/creator.")

class CreatorMerge(BaseModel):
    source_ids: list[int] = Field(..., description="List of duplicate creator IDs that will be merged into the target and then deleted.")
    target_id: int = Field(..., description="The ID of the primary creator that will absorb the source creators.")

class CreatorStats(BaseModel):
    total_sets: int = Field(0, description="Total number of sets associated with this creator.")
    total_images: int = Field(0, description="Total number of individual images across all sets for this creator.")
    total_size_bytes: int = Field(0, description="Total combined file size of all images for this creator in bytes.")
    primary_aspect_ratio: Optional[str] = Field(None, description="The most common aspect ratio among this creator's images.")
    preview_image_id: Optional[int] = Field(None, description="ID of a representative image to use as the creator's avatar/cover.")

class Creator(CreatorBase):
    id: int = Field(..., description="Unique database identifier for the creator.")
    stats: Optional[CreatorStats] = Field(None, description="Aggregated statistics for the creator's portfolio.")
    model_config = ConfigDict(from_attributes=True)

class CreatorPage(BaseModel):
    items: list[Creator] = Field(..., description="Paginated list of creators.")
    total: int = Field(..., description="Total number of creators matching the query.")
    skip: int = Field(..., description="Number of items skipped.")
    limit: int = Field(..., description="Maximum number of items returned.")

class CreatorWithSets(Creator):
    sets: list["Set"] = Field([], description="List of all sets belonging to this creator.")

from app.schemas.set import Set  # noqa: E402
CreatorWithSets.model_rebuild()