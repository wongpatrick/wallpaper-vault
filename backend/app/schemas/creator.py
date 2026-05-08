from typing import Optional
from pydantic import BaseModel, ConfigDict

class CreatorBase(BaseModel):
    canonical_name: str
    type: Optional[str] = None
    notes: Optional[str] = None

class CreatorCreate(CreatorBase):
    pass

class CreatorUpdate(CreatorBase):
    canonical_name: Optional[str] = None

class CreatorMerge(BaseModel):
    source_ids: list[int]
    target_id: int

class CreatorStats(BaseModel):
    total_sets: int = 0
    total_images: int = 0
    total_size_bytes: int = 0
    primary_aspect_ratio: Optional[str] = None
    preview_image_id: Optional[int] = None

class Creator(CreatorBase):
    id: int
    stats: Optional[CreatorStats] = None
    model_config = ConfigDict(from_attributes=True)

class CreatorPage(BaseModel):
    items: list[Creator]
    total: int
    skip: int
    limit: int

class CreatorWithSets(Creator):
    sets: list["Set"] = []

from app.schemas.set import Set  # noqa: E402
CreatorWithSets.model_rebuild()