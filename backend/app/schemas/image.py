from typing import Optional, List
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
    sort_order: Optional[int] = 0
    notes: Optional[str] = None
    rating: Optional[str] = "questionable"
    dominant_color: Optional[str] = None
    tags: Optional[str] = None

class ImageCreate(ImageBase):
    pass

class ImageUpdate(BaseModel):
    filename: Optional[str] = None
    notes: Optional[str] = None
    sort_order: Optional[int] = None
    phash: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    file_size: Optional[int] = None
    aspect_ratio: Optional[float] = None
    aspect_ratio_label: Optional[str] = None
    local_path: Optional[str] = None
    rating: Optional[str] = None
    dominant_color: Optional[str] = None
    tags: Optional[str] = None

class Image(ImageBase):
    id: int
    set_id: int
    date_added: str

    model_config = ConfigDict(from_attributes=True)

class ImageWithContext(Image):
    set_title: str
    creator_names: List[str]

class DuplicateGroup(BaseModel):
    phash: str
    images: List[ImageWithContext]
    recommended_keep_id: int

class DuplicateResolutionRequest(BaseModel):
    keep_image_id: int
    remove_image_ids: List[int]

from app.schemas.set import BulkOperationMode

class ImageBulkUpdate(BaseModel):
    image_ids: list[int]
    update_data: ImageUpdate
    operation_mode: BulkOperationMode = BulkOperationMode.APPEND

class ImagePage(BaseModel):
    items: List[ImageWithContext]
    total: int
    skip: int
    limit: int
