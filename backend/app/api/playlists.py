"""
API router for Playlist management endpoints.
"""
from typing import Optional, List
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.crud import playlist as crud_playlist
from app.crud import image as crud_image
from app.schemas.playlist import (
    Playlist, PlaylistCreate, PlaylistUpdate, PlaylistDetail,
    PlaylistImageDetail, PlaylistImagesAdd, PlaylistImagesRemove, PlaylistImagesReorder
)
from app.schemas.image import Image as ImageSchema
import structlog

logger = structlog.get_logger(__name__)

router = APIRouter()

@router.get("", response_model=List[Playlist])
async def read_playlists(db: AsyncSession = Depends(get_db)) -> List[Playlist]:
    """Get all playlists with their image counts."""
    return await crud_playlist.get_playlists(db)

@router.post("", response_model=Playlist)
async def create_playlist_endpoint(
    playlist_in: PlaylistCreate,
    db: AsyncSession = Depends(get_db)
) -> Playlist:
    """Create a new playlist. Name must be unique."""
    existing = await crud_playlist.get_playlist_by_name(db, playlist_in.name)
    if existing:
        raise HTTPException(status_code=400, detail="A playlist with this name already exists")
    return await crud_playlist.create_playlist(db, playlist_in)

@router.get("/{playlist_id}", response_model=PlaylistDetail)
async def read_playlist(
    playlist_id: int,
    db: AsyncSession = Depends(get_db)
) -> PlaylistDetail:
    """Get detailed information for a playlist, including its sorted images."""
    db_playlist = await crud_playlist.get_playlist(db, playlist_id)
    if db_playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    # Map playlist_images relation to PlaylistImageDetail
    images_list = []
    from app.api.images import map_image_to_schema
    for pi in db_playlist.playlist_images:
        images_list.append(PlaylistImageDetail(
            image=map_image_to_schema(pi.image),
            sort_order=pi.sort_order
        ))
        
    return PlaylistDetail(
        id=db_playlist.id,
        name=db_playlist.name,
        description=db_playlist.description,
        date_created=str(db_playlist.date_created),
        image_count=db_playlist.image_count,
        images=images_list
    )

@router.put("/{playlist_id}", response_model=Playlist)
async def update_playlist_endpoint(
    playlist_id: int,
    playlist_in: PlaylistUpdate,
    db: AsyncSession = Depends(get_db)
) -> Playlist:
    """Update a playlist's name or description."""
    if playlist_in.name:
        existing = await crud_playlist.get_playlist_by_name(db, playlist_in.name)
        if existing and existing.id != playlist_id:
            raise HTTPException(status_code=400, detail="A playlist with this name already exists")
            
    db_playlist = await crud_playlist.update_playlist(db, playlist_id, playlist_in)
    if db_playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return db_playlist

@router.delete("/{playlist_id}", response_model=Playlist)
async def delete_playlist_endpoint(
    playlist_id: int,
    db: AsyncSession = Depends(get_db)
) -> Playlist:
    """Delete a playlist. Image files are not affected, only references are removed."""
    db_playlist = await crud_playlist.delete_playlist(db, playlist_id)
    if db_playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return db_playlist

@router.post("/{playlist_id}/images", response_model=dict)
async def add_images(
    playlist_id: int,
    payload: PlaylistImagesAdd,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Add a list of images to a playlist. Rejects duplicates."""
    playlist = await crud_playlist.get_playlist(db, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
        
    added_count = await crud_playlist.add_images_to_playlist(db, playlist_id, payload.image_ids)
    return {
        "message": f"Successfully added {added_count} images to playlist",
        "added_count": added_count
    }

@router.delete("/{playlist_id}/images", response_model=dict)
async def remove_images(
    playlist_id: int,
    payload: PlaylistImagesRemove,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Remove a list of images from a playlist."""
    playlist = await crud_playlist.get_playlist(db, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
        
    removed_count = await crud_playlist.remove_images_from_playlist(db, playlist_id, payload.image_ids)
    return {
        "message": f"Successfully removed {removed_count} images from playlist",
        "removed_count": removed_count
    }

@router.put("/{playlist_id}/images/reorder", response_model=dict)
async def reorder_images(
    playlist_id: int,
    payload: PlaylistImagesReorder,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Reorder images within a playlist."""
    playlist = await crud_playlist.get_playlist(db, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
        
    await crud_playlist.reorder_playlist_images(db, playlist_id, payload.image_ids)
    return {"message": "Successfully reordered playlist images"}

@router.get("/{playlist_id}/random", response_model=ImageSchema)
async def read_playlist_random_image(
    playlist_id: int,
    tags: Optional[List[str]] = Query(None),
    ratio: Optional[str] = Query(None, alias="aspect_ratio_label"),
    min_w: Optional[int] = Query(None, alias="min_width"),
    min_h: Optional[int] = Query(None, alias="min_height"),
    creator_id: Optional[int] = None,
    rating: Optional[str] = Query(None),
    favorite_probability: Optional[float] = Query(None),
    target_monitor: Optional[str] = Query("all"),
    orientation: Optional[str] = Query(None),
    log_rotation: bool = Query(True),
    db: AsyncSession = Depends(get_db)
) -> ImageSchema:
    """Get a random image from a playlist, with optional filters."""
    playlist = await crud_playlist.get_playlist(db, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
        
    db_image = await crud_image.get_random_image(
        db,
        tags=tags,
        aspect_ratio_label=ratio,
        min_width=min_w,
        min_height=min_h,
        creator_id=creator_id,
        playlist_id=playlist_id,
        rating=rating,
        favorite_probability=favorite_probability,
        orientation=orientation
    )
    if db_image is None:
        raise HTTPException(status_code=404, detail="No images found matching criteria in this playlist")
        
    if log_rotation:
        from app.core.rotation import log_rotation
        await log_rotation(db, image_id=db_image.id, aspect_ratio=db_image.aspect_ratio_label, target_monitor=target_monitor)
        
    from app.api.images import map_image_to_schema
    return map_image_to_schema(db_image)

@router.get("/{playlist_id}/random/file")
async def read_playlist_random_image_file(
    playlist_id: int,
    tags: Optional[List[str]] = Query(None),
    ratio: Optional[str] = Query(None, alias="aspect_ratio_label"),
    min_w: Optional[int] = Query(None, alias="min_width"),
    min_h: Optional[int] = Query(None, alias="min_height"),
    creator_id: Optional[int] = None,
    rating: Optional[str] = Query(None),
    favorite_probability: Optional[float] = Query(None),
    target_monitor: Optional[str] = Query("all"),
    orientation: Optional[str] = Query(None),
    log_rotation: bool = Query(True),
    db: AsyncSession = Depends(get_db)
) -> FileResponse:
    """Get a random image file from a playlist, with optional filters (DisplayFusion compatible)."""
    playlist = await crud_playlist.get_playlist(db, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
        
    db_image = await crud_image.get_random_image(
        db,
        tags=tags,
        aspect_ratio_label=ratio,
        min_width=min_w,
        min_height=min_h,
        creator_id=creator_id,
        playlist_id=playlist_id,
        rating=rating,
        favorite_probability=favorite_probability,
        orientation=orientation
    )
    if db_image is None:
        raise HTTPException(status_code=404, detail="No images found matching criteria in this playlist")
        
    if log_rotation:
        from app.core.rotation import log_rotation
        await log_rotation(db, image_id=db_image.id, aspect_ratio=db_image.aspect_ratio_label, target_monitor=target_monitor)
        
    file_path = Path(db_image.local_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found on disk")
        
    return FileResponse(
        str(file_path),
        filename=db_image.filename,
        content_disposition_type="inline"
    )

@router.get("/{playlist_id}/random/file/{ratio}/image.jpg")
async def read_playlist_random_image_file_path(
    playlist_id: int,
    ratio: str,
    db: AsyncSession = Depends(get_db)
) -> FileResponse:
    """Get a random image file from a playlist based on ratio in the path (DisplayFusion compatible)."""
    playlist = await crud_playlist.get_playlist(db, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
        
    db_image = await crud_image.get_random_image(
        db,
        aspect_ratio_label=ratio,
        playlist_id=playlist_id
    )
    if db_image is None:
        raise HTTPException(status_code=404, detail="No images found matching criteria in this playlist")
        
    file_path = Path(db_image.local_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found on disk")
        
    return FileResponse(
        str(file_path),
        filename=db_image.filename,
        content_disposition_type="inline"
    )

@router.get("/{playlist_id}/random/file/{ratio}/tags/{tags:path}/image.jpg")
async def read_playlist_random_image_file_path_tags(
    playlist_id: int,
    ratio: str,
    tags: str,
    db: AsyncSession = Depends(get_db)
) -> FileResponse:
    """Get a random image file from a playlist based on ratio and tags in the path (DisplayFusion compatible)."""
    playlist = await crud_playlist.get_playlist(db, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
        
    tag_list = [t.strip() for t in tags.split("/") if t.strip()]
    db_image = await crud_image.get_random_image(
        db,
        aspect_ratio_label=ratio,
        tags=tag_list,
        playlist_id=playlist_id
    )
    if db_image is None:
        raise HTTPException(status_code=404, detail="No images found matching criteria in this playlist")
        
    file_path = Path(db_image.local_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found on disk")
        
    return FileResponse(
        str(file_path),
        filename=db_image.filename,
        content_disposition_type="inline"
    )
