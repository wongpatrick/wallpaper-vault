"""
Pydantic schemas for wallpaper rotation settings profiles.
Defines representation, creation, and update structures.
"""
from typing import Optional
from pydantic import BaseModel, Field

class RotationProfileBase(BaseModel):
    name: str = Field(..., description="Unique name of the rotation settings profile.")
    config_json: str = Field(..., description="JSON stringified settings for global and monitor configurations.")

class RotationProfileCreate(RotationProfileBase):
    pass

class RotationProfile(RotationProfileBase):
    id: int = Field(..., description="Unique database ID of the profile.")
    created_at: Optional[str] = Field(None, description="Timestamp when the profile was saved.")

    class Config:
        from_attributes = True
