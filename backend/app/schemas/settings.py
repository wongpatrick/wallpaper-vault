"""
Pydantic schemas for application settings.
Defines models for managing configuration key-value pairs.
"""
from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime

class SettingBase(BaseModel):
    value: str = Field(..., description="The stringified value of the setting.")
    description: Optional[str] = Field(None, description="Human-readable explanation of what this setting controls.")

class SettingCreate(SettingBase):
    key: str = Field(..., description="Unique string key identifying the setting (e.g., 'auto_import_path').")

class SettingUpdate(BaseModel):
    value: str = Field(..., description="The new value for the setting.")
    description: Optional[str] = Field(None, description="Updated description.")

class Setting(SettingBase):
    key: str = Field(..., description="Unique string key identifying the setting.")
    updated_at: datetime = Field(..., description="Timestamp when the setting was last modified.")

    class Config:
        from_attributes = True
