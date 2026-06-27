"""Schemas for bulk operations."""
from pydantic import BaseModel, Field

class BulkDeleteRequest(BaseModel):
    ids: list[int] = Field(..., description="List of IDs to delete.")
