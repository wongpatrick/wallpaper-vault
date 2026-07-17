"""
Pydantic schemas for wallpaper rotation rules.
Defines representation, creation, and update structures.
"""
from typing import Optional
from pydantic import BaseModel, Field

class RotationRuleBase(BaseModel):
    name: str = Field(..., description="Name of the scheduled rule.")
    priority: int = Field(0, description="Evaluation priority. Higher priority rules match first.")
    enabled: int = Field(1, description="Whether the rule is enabled (1 for true, 0 for false).")
    
    # Conditions
    start_date: Optional[str] = Field(None, description="Start date (MM-DD) for rule validity.")
    end_date: Optional[str] = Field(None, description="End date (MM-DD) for rule validity.")
    days_of_week: Optional[str] = Field(None, description="Comma-separated day indices (e.g. '1,2,3,4,5' where Mon=1, Sun=7).")
    start_time: Optional[str] = Field(None, description="Start time of day (HH:MM) when rule becomes active.")
    end_time: Optional[str] = Field(None, description="End time of day (HH:MM) when rule is no longer active.")
    
    # Overrides
    source: str = Field(..., description="Wallpaper source: 'entire_library' or 'playlist'.")
    playlist_id: Optional[int] = Field(None, description="Specific playlist ID to rotate from (if source is 'playlist').")
    style: Optional[str] = Field(None, description="Wallpaper fit style override.")

class RotationRuleCreate(RotationRuleBase):
    pass

class RotationRuleUpdate(BaseModel):
    name: Optional[str] = None
    priority: Optional[int] = None
    enabled: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    days_of_week: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    source: Optional[str] = None
    playlist_id: Optional[int] = None
    style: Optional[str] = None

class RotationRule(RotationRuleBase):
    id: int = Field(..., description="Unique database ID of the rule.")

    class Config:
        from_attributes = True
