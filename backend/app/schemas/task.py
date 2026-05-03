from typing import Optional
from pydantic import BaseModel
from datetime import datetime

class TaskBase(BaseModel):
    id: str
    status: str
    progress: int = 0
    total: int = 0
    error_message: Optional[str] = None
    updated_at: datetime

class TaskSchema(TaskBase):
    pass
