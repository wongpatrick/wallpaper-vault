"""
Pydantic schemas for background tasks.
Defines models for representing task progress and status.
"""
from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime

class TaskBase(BaseModel):
    id: str = Field(..., description="Unique UUID for the background task.")
    status: str = Field(..., description="Current status (e.g., 'pending', 'running', 'completed', 'failed').")
    progress: int = Field(0, description="Number of items processed so far.")
    total: int = Field(0, description="Total number of items to process.")
    error_message: Optional[str] = Field(None, description="Detailed error message if the task failed.")
    updated_at: datetime = Field(..., description="Last time the task status or progress was updated.")

class TaskSchema(TaskBase):
    pass
