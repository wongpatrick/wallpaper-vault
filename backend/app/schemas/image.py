"""
Pydantic schemas for image entities.
Defines models for creating, updating, bulk operations, and deduplication of images.
"""
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field, field_validator

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
    focal_point_x: Optional[int] = Field(50, description="Computed X percentage for the focal point.")
    focal_point_y: Optional[int] = Field(50, description="Computed Y percentage for the focal point.")
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
    focal_point_x: Optional[int] = Field(None, description="Computed X percentage for the focal point.")
    focal_point_y: Optional[int] = Field(None, description="Computed Y percentage for the focal point.")
    tags: Optional[list[str]] = Field(None, description="Updated list of tag names for this image.")

class Image(ImageBase):
    id: int = Field(..., description="Unique database identifier for the image.")
    set_id: int = Field(..., description="ID of the set this image belongs to.")
    date_added: str = Field(..., description="Timestamp when the image was added to the database.")

    model_config = ConfigDict(from_attributes=True)

class ImageDetail(Image):
    tags: list[str] = Field(default_factory=list, description="List of descriptive tag names for the image.")

    @field_validator('tags', mode='before')
    @classmethod
    def extract_tag_names(cls, v):
        if not v:
            return []
        return [tag.name if hasattr(tag, 'name') else str(tag) for tag in v]

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
    operation_mode: BulkOperationMode = Field(BulkOperationMode.APPEND, description="How to apply list-like fields (e.g., notes). APPEND or OVERWRITE.")

class ImagePage(BaseModel):
    items: List[ImageWithContext] = Field(..., description="Paginated list of images.")
    total: int = Field(..., description="Total number of images matching the query.")
    skip: int = Field(..., description="Number of items skipped.")
    limit: int = Field(..., description="Maximum number of items returned.")

class ImageBulkMove(BaseModel):
    image_ids: List[int] = Field(..., description="List of image IDs to move.")
    target_set_id: int = Field(..., description="The ID of the destination set.")

class ImageValidationItem(BaseModel):
    local_path: str
    filename: str
    is_valid: bool
    error: Optional[str] = None
    phash: Optional[str] = None
    is_duplicate: bool
    existing_image_id: Optional[int] = None
    existing_set_title: Optional[str] = None
    existing_creator_names: list[str] = Field(default_factory=list)

class ImageImportValidationRequest(BaseModel):
    local_paths: list[str] = Field(..., description="List of local absolute file paths (files or folders) to validate.")

class ImageImportValidationResponse(BaseModel):
    items: list[ImageValidationItem]

class ImageImportItem(BaseModel):
    local_path: str
    filename: Optional[str] = None
    rating: Optional[str] = None
    tags: Optional[list[str]] = None

class ImageImportRequest(BaseModel):
    items: list[ImageImportItem] = Field(..., description="List of items to import.")
    creator_name: Optional[str] = Field(None, description="Global creator/artist to assign by default.")
    set_title: Optional[str] = Field(None, description="Global set name/title to assign by default.")
    set_id: Optional[int] = Field(None, description="Global set ID to import into, if assigning to an existing set.")
    tags: Optional[list[str]] = Field(None, description="Global tags to assign to all imported files.")
    rating: Optional[str] = Field("questionable", description="Global content rating.")
    delete_source: bool = Field(False, description="Whether to delete source files after successful import.")

