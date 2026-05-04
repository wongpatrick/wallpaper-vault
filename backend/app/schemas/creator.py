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
    source_id: int
    target_id: int

class Creator(CreatorBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class CreatorWithSets(Creator):
    sets: list["Set"] = []

from app.schemas.set import Set  # noqa: E402
CreatorWithSets.model_rebuild()