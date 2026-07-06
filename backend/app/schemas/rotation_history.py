"""
Pydantic schemas for rotation history database entities.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict
from app.schemas.image import ImageDetail

class RotationHistoryBase(BaseModel):
    image_id: int = Field(..., description="ID of the served image.")
    aspect_ratio: Optional[str] = Field(None, description="Aspect ratio label at the time of rotation.")

class RotationHistoryCreate(RotationHistoryBase):
    pass

class RotationHistory(RotationHistoryBase):
    id: int
    timestamp: datetime = Field(..., description="Timestamp when the rotation occurred.")

    model_config = ConfigDict(from_attributes=True)

class RotationHistoryDetail(RotationHistory):
    image: Optional[ImageDetail] = Field(None, description="Detailed image details of the rotated wallpaper.")
