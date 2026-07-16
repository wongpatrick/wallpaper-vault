"""Schemas for characters."""
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional
from app.schemas.franchise import Franchise

class CharacterBase(BaseModel):
    name: str = Field(..., description="The name of the character.")
    franchise_id: Optional[int] = Field(None, description="The ID of the franchise this character belongs to.")

class CharacterCreate(CharacterBase):
    pass

class CharacterUpdate(BaseModel):
    name: Optional[str] = Field(None, description="The updated name of the character.")
    franchise_id: Optional[int] = Field(None, description="The updated franchise ID.")

class Character(CharacterBase):
    id: int = Field(..., description="Unique database identifier for the character.")
    franchise: Optional["Franchise"] = Field(None, description="The franchise this character belongs to.")
    set_count: int = Field(0, description="Number of sets featuring this character.")
    image_count: int = Field(0, description="Number of wallpapers featuring this character.")

    model_config = ConfigDict(from_attributes=True)

class CharacterMerge(BaseModel):
    source_ids: list[int] = Field(..., description="List of character IDs to merge and delete.")
    target_id: int = Field(..., description="The ID of the character to merge into.")
