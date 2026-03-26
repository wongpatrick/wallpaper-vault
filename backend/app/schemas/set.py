from typing import Optional
from pydantic import BaseModel, ConfigDict

from app.schemas.creator import Creator

class SetBase(BaseModel):
    title: Optional[str] = None
    source_url: Optional[str] = None
    local_path: Optional[str] = None
    phash: Optional[str] = None
    notes: Optional[str] = None

class SetCreate(SetBase):
    creator_ids: list[int] = []

class SetUpdate(SetBase):
    pass

class Set(SetBase):
    id: int
    date_added: str

    creators: list[Creator] = []

    model_config = ConfigDict(from_attributes=True)