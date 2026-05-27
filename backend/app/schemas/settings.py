"""
Pydantic schemas for application settings.
Defines models for managing configuration key-value pairs.
"""
from typing import Optional
from pydantic import BaseModel
from datetime import datetime

class SettingBase(BaseModel):
    value: str
    description: Optional[str] = None

class SettingCreate(SettingBase):
    key: str

class SettingUpdate(BaseModel):
    value: str
    description: Optional[str] = None

class Setting(SettingBase):
    key: str
    updated_at: datetime

    class Config:
        from_attributes = True
