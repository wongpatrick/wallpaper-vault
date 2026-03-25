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

class Creator(CreatorBase):
    id: int
    model_config = ConfigDict(from_attributes=True)