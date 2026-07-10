"""
Pydantic schemas for Playlist entities.
Defines models for creating, updating, viewing, and reordering playlists.
"""
from typing import Optional, List, Literal
from pydantic import BaseModel, ConfigDict, Field
from app.schemas.image import Image

class SmartPlaylistRules(BaseModel):
    included_tags: Optional[List[str]] = Field(default_factory=list, description="Tags to match (OR criteria).")
    excluded_tags: Optional[List[str]] = Field(default_factory=list, description="Tags to exclude.")
    ratings: Optional[List[Literal["safe", "questionable", "explicit"]]] = Field(default_factory=list, description="Ratings allowed (safe, questionable, explicit).")
    is_favorite: Optional[bool] = Field(None, description="Filter by favorite status (True = only favorites, False = only non-favorites).")
    min_width: Optional[int] = Field(None, description="Minimum image width.")
    min_height: Optional[int] = Field(None, description="Minimum image height.")
    creator_id: Optional[int] = Field(None, description="Filter by creator ID.")
    sort_by: Optional[Literal["date_added", "filename", "resolution", "file_size", "rating"]] = Field("date_added", description="Field to sort by: date_added, filename, resolution, file_size, rating.")
    sort_dir: Optional[Literal["asc", "desc"]] = Field("desc", description="Sort direction: asc or desc.")

class PlaylistBase(BaseModel):
    name: str = Field(..., description="The name of the playlist.")
    description: Optional[str] = Field(None, description="Optional description of the playlist.")
    is_smart: bool = Field(False, description="Whether the playlist is a smart (dynamic) playlist.")
    rules: Optional[SmartPlaylistRules] = Field(None, description="Filter rules for the smart playlist.")

class PlaylistCreate(PlaylistBase):
    pass

class PlaylistUpdate(BaseModel):
    name: Optional[str] = Field(None, description="The updated name of the playlist.")
    description: Optional[str] = Field(None, description="The updated description of the playlist.")
    rules: Optional[SmartPlaylistRules] = Field(None, description="The updated filter rules for the smart playlist.")

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
