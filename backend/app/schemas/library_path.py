"""Schemas for library storage paths."""
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field

class LibraryPathBase(BaseModel):
    path: str = Field(..., description="Absolute filesystem path on the host machine.")
    label: Optional[str] = Field(None, description="User-friendly display name (e.g. 'Local SSD', 'NAS Backup').")
    is_default: bool = Field(False, description="Whether this is the default library path for new imports.")

class LibraryPathCreate(LibraryPathBase):
    scan_existing: bool = Field(True, description="Whether to automatically scan for and register existing sets in the directory.")

class LibraryPathUpdate(BaseModel):
    label: Optional[str] = Field(None, description="Updated display name.")
    is_default: Optional[bool] = Field(None, description="Updated default status.")

class LibraryPath(LibraryPathBase):
    id: int = Field(..., description="Unique database identifier for the library path.")
    created_at: Optional[str] = Field(None, description="Timestamp when the path was added.")
    set_count: int = Field(0, description="Number of sets stored in this library path.")

    model_config = ConfigDict(from_attributes=True)

class LibraryPathPage(BaseModel):
    items: list[LibraryPath] = Field(..., description="List of library paths.")
    total: int = Field(..., description="Total number of library paths.")
