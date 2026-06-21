"""
Pydantic schemas for Playlist entities.
Defines models for creating, updating, viewing, and reordering playlists.
"""
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field
from app.schemas.image import Image

class PlaylistBase(BaseModel):
    name: str = Field(..., description="The name of the playlist.")
    description: Optional[str] = Field(None, description="Optional description of the playlist.")

class PlaylistCreate(PlaylistBase):
    pass

class PlaylistUpdate(BaseModel):
    name: Optional[str] = Field(None, description="The updated name of the playlist.")
    description: Optional[str] = Field(None, description="The updated description of the playlist.")

class PlaylistImageDetail(BaseModel):
    image: Image = Field(..., description="The image object.")
    sort_order: int = Field(..., description="The position of the image in the playlist.")

class Playlist(PlaylistBase):
    id: int = Field(..., description="Unique database identifier for the playlist.")
    date_created: str = Field(..., description="Timestamp when the playlist was created.")
    image_count: int = Field(0, description="Number of images in the playlist.")

    model_config = ConfigDict(from_attributes=True)

class PlaylistDetail(Playlist):
    images: List[PlaylistImageDetail] = Field(default_factory=list, description="Sorted list of images in the playlist.")

class PlaylistImagesAdd(BaseModel):
    image_ids: List[int] = Field(..., description="List of image IDs to add to the playlist.")

class PlaylistImagesRemove(BaseModel):
    image_ids: List[int] = Field(..., description="List of image IDs to remove from the playlist.")

class PlaylistImagesReorder(BaseModel):
    image_ids: List[int] = Field(..., description="Ordered list of image IDs representing the new sequence.")
