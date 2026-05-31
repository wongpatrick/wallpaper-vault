"""
Pydantic schemas for set entities.
Defines models for creating, updating, importing, and bulk managing sets.
"""
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from app.core.enums import BulkOperationMode

from app.schemas.creator import Creator  # noqa: E402
from app.schemas.image import Image, ImageCreate  # noqa: E402

class SetBase(BaseModel):
    title: Optional[str] = Field(None, description="The display title of the set.")
    source_url: Optional[str] = Field(None, description="Original URL where the set was downloaded from.")
    local_path: Optional[str] = Field(None, description="Local filesystem path where the set's files reside.")
    phash: Optional[str] = Field(None, description="Perceptual hash representative of the set (usually the cover image).")
    notes: Optional[str] = Field(None, description="User-provided notes or context for the set.")
    tags: Optional[str] = Field(None, description="Comma-separated descriptive tags for the set.")

class SetCreate(SetBase):
    creator_ids: list[int] = Field([], description="List of creator IDs to associate with this set.")
    images: list[ImageCreate] = Field([], description="List of images to create and associate with this set.")

class SetImport(BaseModel):
    title: str = Field(..., description="Title of the imported set.")
    creator_names: list[str] = Field([], description="List of creator names extracted during import.")
    local_path: Optional[str] = Field(None, description="Path to the directory containing the set.")
    images: list[ImageCreate] = Field([], description="Images found during the import process.")
    notes: Optional[str] = Field(None, description="Auto-generated or extracted notes.")

class SetBatchImport(BaseModel):
    source_path: str = Field(..., description="Absolute path to the directory to import.")
    creator_name: Optional[str] = Field(None, description="Explicit creator name to assign. If null, attempts to extract from path.")
    set_title: Optional[str] = Field(None, description="Explicit set title to assign. If null, attempts to extract from path.")
    delete_source: bool = Field(False, description="If true, the source directory will be permanently deleted after a successful import.")
    auto_orient: bool = Field(True, description="Whether to automatically orient images based on EXIF data during import.")

class BatchImportItem(BaseModel):
    source_path: str = Field(..., description="Path of the item being imported.")
    creator_name: str = Field(..., description="Resolved creator name for this item.")
    set_title: str = Field(..., description="Resolved set title for this item.")
    status: str = Field("pending", description="Current import status (e.g., 'pending', 'success', 'error').")
    error: Optional[str] = Field(None, description="Error message if the import failed.")
    is_valid: bool = Field(default=True, alias="isValid", description="Indicates if the item passed pre-import validation.")

class BatchImportRequest(BaseModel):
    items: list[SetBatchImport] = Field([], description="List of directories to import.")
    scan_auto_path: bool = Field(False, description="If true, automatically scans the configured auto-import directory.")
    dry_run: bool = Field(True, description="If true, only returns what would happen without actually importing.")
    parsing_template: Optional[str] = Field(None, description="Regex template used to extract Creator and Set names from the directory structure (e.g., '[Creator] - [Set]').")
    delete_source_default: bool = Field(False, description="Default value for delete_source applied to scanned items.")

class BatchImportResponse(BaseModel):
    items: list[BatchImportItem] = Field(..., description="Status of each imported item.")
    summary: dict = Field({}, description="Summary statistics of the import operation.")
    task_id: Optional[str] = Field(None, description="Background task ID if the import was queued asynchronously.")
    status: Optional[str] = Field(None, description="Overall status of the batch import request.")

class SetUpdate(SetBase):
    creator_ids: Optional[list[int]] = Field(None, description="Updated list of creator IDs for this set.")

class Set(SetBase):
    id: int = Field(..., description="Unique database identifier for the set.")
    date_added: str = Field(..., description="Timestamp when the set was added to the vault.")

    creators: list[Creator] = Field([], description="List of creators associated with this set.")
    images: list[Image] = Field([], description="List of images contained in this set.")

    model_config = ConfigDict(from_attributes=True)

class SetPage(BaseModel):
    items: list[Set] = Field(..., description="Paginated list of sets.")
    total: int = Field(..., description="Total number of sets matching the query.")
    skip: int = Field(..., description="Number of items skipped.")
    limit: int = Field(..., description="Maximum number of items returned.")

class SetBulkUpdate(BaseModel):
    set_ids: list[int] = Field(..., description="List of set IDs to apply the bulk update to.")
    update_data: SetUpdate = Field(..., description="The data to apply to all selected sets.")
    operation_mode: BulkOperationMode = Field(BulkOperationMode.APPEND, description="How to apply list-like fields (APPEND or OVERWRITE).")

class SetMerge(BaseModel):
    source_ids: list[int] = Field(..., description="List of set IDs to merge. These sets will be deleted.")
    target_id: int = Field(..., description="The ID of the set that will receive all images from the source sets.")
