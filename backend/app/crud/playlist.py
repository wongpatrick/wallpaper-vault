"""
CRUD operations for retrieving and managing Playlists and their images.
"""
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, update
from sqlalchemy.orm import selectinload
from app.models.playlist import Playlist, PlaylistImage
from app.schemas.playlist import PlaylistCreate, PlaylistUpdate

async def get_playlist(db: AsyncSession, playlist_id: int) -> Optional[Playlist]:
    """Retrieves a single playlist by its ID, with its ordered images loaded."""
    stmt = (
        select(Playlist)
        .options(
            selectinload(Playlist.playlist_images)
            .selectinload(PlaylistImage.image)
        )
        .filter(Playlist.id == playlist_id)
    )
    result = await db.execute(stmt)
    playlist = result.scalar_one_or_none()
    
    if playlist:
        playlist.image_count = len(playlist.playlist_images)
    return playlist

async def get_playlist_by_name(db: AsyncSession, name: str) -> Optional[Playlist]:
    """Retrieves a playlist by its name."""
    stmt = select(Playlist).filter(Playlist.name == name)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()

async def get_playlists(db: AsyncSession) -> List[Playlist]:
    """Retrieves all playlists with their image counts, sorted by name."""
    stmt = (
        select(Playlist, func.count(PlaylistImage.image_id).label("image_count"))
        .outerjoin(PlaylistImage)
        .group_by(Playlist.id)
        .order_by(Playlist.name.asc())
    )
    result = await db.execute(stmt)
    
    playlists = []
    for playlist, image_count in result.all():
        playlist.image_count = image_count
        playlists.append(playlist)
        
    return playlists

async def create_playlist(db: AsyncSession, playlist_in: PlaylistCreate) -> Playlist:
    """Creates a new playlist."""
    db_playlist = Playlist(
        name=playlist_in.name,
        description=playlist_in.description
    )
    db.add(db_playlist)
    await db.commit()
    await db.refresh(db_playlist)
    db_playlist.image_count = 0
    return db_playlist

async def update_playlist(
    db: AsyncSession, 
    playlist_id: int, 
    playlist_in: PlaylistUpdate
) -> Optional[Playlist]:
    """Updates an existing playlist's name and/or description."""
    db_playlist = await get_playlist(db, playlist_id)
    if not db_playlist:
        return None
        
    update_data = playlist_in.model_dump(exclude_unset=True)
    for field in update_data:
        setattr(db_playlist, field, update_data[field])
        
    db.add(db_playlist)
    await db.commit()
    await db.refresh(db_playlist)
    return db_playlist

async def delete_playlist(db: AsyncSession, playlist_id: int) -> Optional[Playlist]:
    """Deletes a playlist. Cascade deletes links in playlist_images."""
    db_playlist = await get_playlist(db, playlist_id)
    if not db_playlist:
        return None
        
    await db.delete(db_playlist)
    await db.commit()
    return db_playlist

async def add_images_to_playlist(
    db: AsyncSession, 
    playlist_id: int, 
    image_ids: List[int]
) -> int:
    """Adds a list of images to a playlist.
    
    Appends them to the end (based on current max sort_order) and ensures
    uniqueness (no duplicates are added).
    """
    # 1. Fetch current max sort_order
    max_order_stmt = select(func.max(PlaylistImage.sort_order)).filter(PlaylistImage.playlist_id == playlist_id)
    max_order_res = await db.execute(max_order_stmt)
    max_order = max_order_res.scalar() or 0
    
    # 2. Fetch existing image IDs in this playlist
    existing_stmt = select(PlaylistImage.image_id).filter(PlaylistImage.playlist_id == playlist_id)
    existing_res = await db.execute(existing_stmt)
    existing_ids = set(existing_res.scalars().all())
    
    # 3. Add only new images
    new_added = 0
    current_order = max_order
    for img_id in image_ids:
        if img_id not in existing_ids:
            current_order += 1
            db_pi = PlaylistImage(
                playlist_id=playlist_id,
                image_id=img_id,
                sort_order=current_order
            )
            db.add(db_pi)
            new_added += 1
            
    if new_added > 0:
        await db.commit()
        
    return new_added

async def remove_images_from_playlist(
    db: AsyncSession, 
    playlist_id: int, 
    image_ids: List[int]
) -> int:
    """Removes a list of images from a playlist."""
    stmt = (
        delete(PlaylistImage)
        .filter(
            PlaylistImage.playlist_id == playlist_id,
            PlaylistImage.image_id.in_(image_ids)
        )
    )
    result = await db.execute(stmt)
    await db.commit()
    return result.rowcount

async def reorder_playlist_images(
    db: AsyncSession, 
    playlist_id: int, 
    image_ids: List[int]
) -> None:
    """Reorders images within a playlist to match the sequence of the provided IDs list."""
    for index, img_id in enumerate(image_ids):
        stmt = (
            update(PlaylistImage)
            .filter(
                PlaylistImage.playlist_id == playlist_id,
                PlaylistImage.image_id == img_id
            )
            .values(sort_order=index)
        )
        await db.execute(stmt)
    await db.commit()
