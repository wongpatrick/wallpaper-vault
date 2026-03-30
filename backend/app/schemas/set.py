from typing import Optional
from pydantic import BaseModel, ConfigDict

from app.schemas.creator import Creator
from app.schemas.image import Image, ImageCreate

class SetBase(BaseModel):
    title: Optional[str] = None
    source_url: Optional[str] = None
    local_path: Optional[str] = None
    phash: Optional[str] = None
    notes: Optional[str] = None

class SetCreate(SetBase):
    creator_ids: list[int] = []
    images: list[ImageCreate] = []

class SetImport(BaseModel):
    title: str
    creator_names: list[str] = []
    local_path: Optional[str] = None
    images: list[ImageCreate] = []
    notes: Optional[str] = None

class SetUpdate(SetBase):
    pass

class Set(SetBase):
    id: int
    date_added: str

    creators: list[Creator] = []
    images: list[Image] = []

    model_config = ConfigDict(from_attributes=True)