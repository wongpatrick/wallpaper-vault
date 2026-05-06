from typing import Optional
from pydantic import BaseModel, ConfigDict

class ImageBase(BaseModel):
    filename: str
    local_path: str
    phash: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    file_size: Optional[int] = None
    aspect_ratio: Optional[float] = None
    aspect_ratio_label: Optional[str] = None
    sort_order: Optional[int] = None
    notes: Optional[str] = None

class ImageCreate(ImageBase):
    pass

class ImageUpdate(BaseModel):
    filename: Optional[str] = None
    local_path: Optional[str] = None
    phash: Optional[str] = None
    aspect_ratio_label: Optional[str] = None
    sort_order: Optional[int] = None
    notes: Optional[str] = None

class Image(ImageBase):
    id: int
    set_id: int
    date_added: str

    model_config = ConfigDict(from_attributes=True)
