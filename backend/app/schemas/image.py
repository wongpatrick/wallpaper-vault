"""
Pydantic schemas for image entities.
Defines models for creating, updating, bulk operations, and deduplication of images.
"""
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field

class ImageBase(BaseModel):
    filename: str = Field(..., description="The original filename of the image.")
    local_path: str = Field(..., description="The absolute local path to the image file on disk.")
    phash: Optional[str] = Field(None, description="Perceptual hash used to detect visually similar or duplicate images.")
    width: Optional[int] = Field(None, description="Image width in pixels.")
    height: Optional[int] = Field(None, description="Image height in pixels.")
    file_size: Optional[int] = Field(None, description="Image file size in bytes.")
    aspect_ratio: Optional[float] = Field(None, description="Calculated aspect ratio (width / height).")
    aspect_ratio_label: Optional[str] = Field(None, description="Human-readable aspect ratio label (e.g., '16:9', 'Ultrawide').")
    sort_order: Optional[int] = Field(0, description="Display order within a set. Lower numbers appear first.")
    notes: Optional[str] = Field(None, description="User-provided notes or description for the image.")
    rating: Optional[str] = Field("questionable", description="Content rating (e.g., 'safe', 'questionable', 'explicit').")
    dominant_color: Optional[str] = Field(None, description="Hex code of the image's dominant color extracted during import.")
    tags: Optional[str] = Field(None, description="Comma-separated string of descriptive tags.")

class ImageCreate(ImageBase):
    pass

class ImageUpdate(BaseModel):
    filename: Optional[str] = Field(None, description="The original filename of the image.")
    notes: Optional[str] = Field(None, description="User-provided notes or description for the image.")
    sort_order: Optional[int] = Field(None, description="Display order within a set.")
    phash: Optional[str] = Field(None, description="Perceptual hash.")
    width: Optional[int] = Field(None, description="Image width in pixels.")
    height: Optional[int] = Field(None, description="Image height in pixels.")
    file_size: Optional[int] = Field(None, description="Image file size in bytes.")
    aspect_ratio: Optional[float] = Field(None, description="Calculated aspect ratio.")
    aspect_ratio_label: Optional[str] = Field(None, description="Human-readable aspect ratio label.")
    local_path: Optional[str] = Field(None, description="The absolute local path to the image file.")
    rating: Optional[str] = Field(None, description="Content rating.")
    dominant_color: Optional[str] = Field(None, description="Hex code of the dominant color.")
    tags: Optional[str] = Field(None, description="Comma-separated tags.")

class Image(ImageBase):
    id: int = Field(..., description="Unique database identifier for the image.")
    set_id: int = Field(..., description="ID of the set this image belongs to.")
    date_added: str = Field(..., description="Timestamp when the image was added to the database.")

    model_config = ConfigDict(from_attributes=True)

class ImageWithContext(Image):
    set_title: str = Field(..., description="The title of the set this image belongs to.")
    creator_names: List[str] = Field(..., description="List of creator names associated with this image's set.")

class DuplicateGroup(BaseModel):
    phash: str = Field(..., description="The perceptual hash shared by this group of duplicates.")
    images: List[ImageWithContext] = Field(..., description="List of visually similar images in this group.")
    recommended_keep_id: int = Field(..., description="The ID of the image recommended to be kept (usually highest resolution).")

class DuplicateResolutionRequest(BaseModel):
    keep_image_id: int = Field(..., description="The ID of the image to keep. All others will be deleted.")
    remove_image_ids: List[int] = Field(..., description="List of image IDs to permanently delete from disk and database.")

from app.core.enums import BulkOperationMode  # noqa: E402

class ImageBulkUpdate(BaseModel):
    image_ids: list[int] = Field(..., description="List of image IDs to apply the bulk update to.")
    update_data: ImageUpdate = Field(..., description="The data to apply to all selected images.")
    operation_mode: BulkOperationMode = Field(BulkOperationMode.APPEND, description="How to apply list-like fields (e.g., tags). APPEND or OVERWRITE.")

class ImagePage(BaseModel):
    items: List[ImageWithContext] = Field(..., description="Paginated list of images.")
    total: int = Field(..., description="Total number of images matching the query.")
    skip: int = Field(..., description="Number of items skipped.")
    limit: int = Field(..., description="Maximum number of items returned.")

class ImageBulkMove(BaseModel):
    image_ids: List[int] = Field(..., description="List of image IDs to move.")
    target_set_id: int = Field(..., description="The ID of the destination set.")
