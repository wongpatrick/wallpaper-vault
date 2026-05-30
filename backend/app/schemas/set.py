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
    title: Optional[str] = None
    source_url: Optional[str] = None
    local_path: Optional[str] = None
    phash: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[str] = None

class SetCreate(SetBase):
    creator_ids: list[int] = []
    images: list[ImageCreate] = []

class SetImport(BaseModel):
    title: str
    creator_names: list[str] = []
    local_path: Optional[str] = None
    images: list[ImageCreate] = []
    notes: Optional[str] = None

class SetBatchImport(BaseModel):
    source_path: str
    creator_name: Optional[str] = None
    set_title: Optional[str] = None
    delete_source: bool = False
    auto_orient: bool = True

class BatchImportItem(BaseModel):
    source_path: str
    creator_name: str
    set_title: str
    status: str = "pending"
    error: Optional[str] = None
    is_valid: bool = Field(default=True, alias="isValid")

class BatchImportRequest(BaseModel):
    items: list[SetBatchImport] = []
    scan_auto_path: bool = False
    dry_run: bool = True
    parsing_template: Optional[str] = None # e.g. "Coser@[Creator] - [Set]"
    delete_source_default: bool = False

class BatchImportResponse(BaseModel):
    items: list[BatchImportItem]
    summary: dict = {}
    task_id: Optional[str] = None
    status: Optional[str] = None

class SetUpdate(SetBase):
    creator_ids: Optional[list[int]] = None

class Set(SetBase):
    id: int
    date_added: str

    creators: list[Creator] = []
    images: list[Image] = []

    model_config = ConfigDict(from_attributes=True)

class SetPage(BaseModel):
    items: list[Set]
    total: int
    skip: int
    limit: int

class SetBulkUpdate(BaseModel):
    set_ids: list[int]
    update_data: SetUpdate
    operation_mode: BulkOperationMode = BulkOperationMode.APPEND

class SetMerge(BaseModel):
    source_ids: list[int]
    target_id: int
