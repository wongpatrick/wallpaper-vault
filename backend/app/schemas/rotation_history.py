"""
Pydantic schemas for rotation history database entities.
"""
from datetime import datetime
from typing import Optional, Literal
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

class SetWallpaperRequest(BaseModel):
    image_id: int = Field(..., description="ID of the image to set as active wallpaper.")
    target_monitor: Optional[str] = Field("all", description="Target monitor index ('all', '0', '1', etc.).")
    style: Optional[Literal["fill", "fit", "stretch", "center", "span", "tile"]] = Field("fill", description="Wallpaper fit style: 'fill', 'fit', 'stretch', 'center', 'span', 'tile'.")

class SetWallpaperResponse(BaseModel):
    status: str = Field("success", description="Status string.")
    image_id: int = Field(..., description="ID of the applied image.")
    target_monitor: str = Field("all", description="Target monitor index.")
    style: str = Field("fill", description="Fit style applied.")

