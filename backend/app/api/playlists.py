"""
API router for Playlist management endpoints.
"""
from typing import Optional, List
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse, Response
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.crud import playlist as crud_playlist
from app.crud import image as crud_image
from app.crud import cross_vault_playlist as crud_cross_vault
from app.core.vault_health import get_online_vault_ids, get_vault_url, get_vault_api_key, get_vault_health
from app.schemas.playlist import (
    Playlist, PlaylistCreate, PlaylistUpdate, PlaylistDetail,
    PlaylistImageDetail, PlaylistImagesAdd, PlaylistImagesRemove, PlaylistImagesReorder,
    CrossVaultImageRef, CrossVaultImageDetail, CrossVaultImagesAdd, CrossVaultImagesRemove, CrossVaultImagesReorder,
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
    res = await crud_playlist.create_playlist(db, playlist_in)
    await db.commit()
    return res

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
    cross_vault_images_list = []
    from app.api.images import map_image_to_schema
    if db_playlist.is_smart:
        images = await crud_playlist.get_smart_playlist_images(db, db_playlist)
        for idx, img in enumerate(images):
            images_list.append(PlaylistImageDetail(
                image=map_image_to_schema(img),
                sort_order=idx
            ))
    elif db_playlist.is_cross_vault:
        for cvi in db_playlist.cross_vault_images:
            vh = get_vault_health(cvi.vault_id)
            cross_vault_images_list.append(CrossVaultImageDetail(
                vault_id=cvi.vault_id,
                image_id=cvi.image_id,
                sort_order=cvi.sort_order,
                vault_label=vh.vault_name if vh else None,
            ))
    else:
        for pi in db_playlist.playlist_images:
            images_list.append(PlaylistImageDetail(
                image=map_image_to_schema(pi.image),
                sort_order=pi.sort_order
            ))
        
    return PlaylistDetail(
        id=db_playlist.id,
        name=db_playlist.name,
        description=db_playlist.description,
        is_smart=db_playlist.is_smart,
        is_cross_vault=db_playlist.is_cross_vault,
        rules=db_playlist.rules,
        created_at=str(db_playlist.created_at),
        image_count=db_playlist.image_count,
        images=images_list,
        cross_vault_images=cross_vault_images_list,
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
    await db.commit()
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
    await db.commit()
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
    if playlist.is_smart:
        raise HTTPException(status_code=400, detail="Cannot manually add images to a smart playlist")
        
    added_count = await crud_playlist.add_images_to_playlist(db, playlist_id, payload.image_ids)
    await db.commit()
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
    if playlist.is_smart:
        raise HTTPException(status_code=400, detail="Cannot manually remove images from a smart playlist")
        
    removed_count = await crud_playlist.remove_images_from_playlist(db, playlist_id, payload.image_ids)
    await db.commit()
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
    if playlist.is_smart:
        raise HTTPException(status_code=400, detail="Cannot manually reorder a smart playlist")
    if playlist.is_cross_vault:
        raise HTTPException(status_code=400, detail="Use /cross-vault-images/reorder for cross-vault playlists")
        
    await crud_playlist.reorder_playlist_images(db, playlist_id, payload.image_ids)
    await db.commit()
    return {"message": "Successfully reordered playlist images"}


# --- Cross-Vault Playlist Endpoints ---

@router.get("/{playlist_id}/cross-vault-images", response_model=List[CrossVaultImageDetail])
async def read_cross_vault_images(
    playlist_id: int,
    db: AsyncSession = Depends(get_db)
) -> List[CrossVaultImageDetail]:
    """Get all cross-vault image references in a cross-vault playlist."""
    playlist = await crud_playlist.get_playlist(db, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if not playlist.is_cross_vault:
        raise HTTPException(status_code=400, detail="This playlist is not a cross-vault playlist")
    
    images = await crud_cross_vault.get_images(db, playlist_id)
    result = []
    for cvi in images:
        vh = get_vault_health(cvi.vault_id)
        result.append(CrossVaultImageDetail(
            vault_id=cvi.vault_id,
            image_id=cvi.image_id,
            sort_order=cvi.sort_order,
            vault_label=vh.vault_name if vh else None,
        ))
    return result


@router.post("/{playlist_id}/cross-vault-images", response_model=dict)
async def add_cross_vault_images(
    playlist_id: int,
    payload: CrossVaultImagesAdd,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Add a list of cross-vault image references to a cross-vault playlist."""
    playlist = await crud_playlist.get_playlist(db, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if not playlist.is_cross_vault:
        raise HTTPException(status_code=400, detail="This playlist is not a cross-vault playlist")
        
    added = await crud_cross_vault.add_images(db, playlist_id, payload.images)
    await db.commit()
    return {
        "message": f"Successfully added {len(added)} cross-vault images",
        "added_count": len(added)
    }


@router.delete("/{playlist_id}/cross-vault-images", response_model=dict)
async def remove_cross_vault_images(
    playlist_id: int,
    payload: CrossVaultImagesRemove,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Remove a list of cross-vault image references from a cross-vault playlist."""
    playlist = await crud_playlist.get_playlist(db, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if not playlist.is_cross_vault:
        raise HTTPException(status_code=400, detail="This playlist is not a cross-vault playlist")
        
    removed_count = await crud_cross_vault.remove_images(db, playlist_id, payload.images)
    await db.commit()
    return {
        "message": f"Successfully removed {removed_count} cross-vault images",
        "removed_count": removed_count
    }


@router.put("/{playlist_id}/cross-vault-images/reorder", response_model=dict)
async def reorder_cross_vault_images(
    playlist_id: int,
    payload: CrossVaultImagesReorder,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Reorder cross-vault images within a playlist."""
    playlist = await crud_playlist.get_playlist(db, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if not playlist.is_cross_vault:
        raise HTTPException(status_code=400, detail="This playlist is not a cross-vault playlist")
        
    await crud_cross_vault.reorder_images(db, playlist_id, payload.images)
    await db.commit()
    return {"message": "Successfully reordered cross-vault playlist images"}


async def _proxy_remote_image_file(
    vault_id: str,
    image_id: int,
    db: AsyncSession,
    aspect_ratio: Optional[str] = None,
    target_monitor: Optional[str] = "all",
    log_rot: bool = True,
) -> Response:
    """Fetch and proxy image bytes from a remote vault instance."""
    vault_url = get_vault_url(vault_id)
    if not vault_url:
        raise HTTPException(status_code=502, detail=f"Source vault '{vault_id}' base URL is not registered or known")
    
    api_key = get_vault_api_key(vault_id)
    headers = {}
    if api_key:
        headers["X-API-Key"] = api_key

    file_url = f"{vault_url}/api/images/file/{image_id}"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(file_url, headers=headers)
            if resp.status_code != status.HTTP_200_OK:
                raise HTTPException(status_code=resp.status_code, detail=f"Remote vault returned status {resp.status_code}")
            
            if log_rot:
                from app.core.rotation import log_rotation
                await log_rotation(
                    db,
                    image_id=None,
                    aspect_ratio=aspect_ratio,
                    target_monitor=target_monitor,
                    vault_id=vault_id,
                    vault_image_id=image_id,
                )
            
            content_type = resp.headers.get("content-type", "image/jpeg")
            return Response(content=resp.content, media_type=content_type, headers={"Content-Disposition": "inline"})
    except httpx.RequestError as exc:
        logger.error("Failed to proxy image file from remote vault", vault_id=vault_id, image_id=image_id, error=str(exc))
        raise HTTPException(status_code=502, detail=f"Failed to communicate with remote vault: {str(exc)}")


@router.get("/{playlist_id}/cross-vault/random", response_model=CrossVaultImageRef)
async def read_cross_vault_random_image_ref(
    playlist_id: int,
    db: AsyncSession = Depends(get_db)
) -> CrossVaultImageRef:
    """Get a random cross-vault image reference from a cross-vault playlist, pre-filtering online vaults."""
    playlist = await crud_playlist.get_playlist(db, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if not playlist.is_cross_vault:
        raise HTTPException(status_code=400, detail="This playlist is not a cross-vault playlist")
    
    online_vault_ids = get_online_vault_ids()
    cvi = await crud_cross_vault.get_random_image(db, playlist_id, online_vault_ids=online_vault_ids if online_vault_ids else None)
    if cvi is None:
        raise HTTPException(status_code=404, detail="No online images found in this cross-vault playlist")
    
    return CrossVaultImageRef(vault_id=cvi.vault_id, image_id=cvi.image_id)


@router.get("/{playlist_id}/cross-vault/random/file")
async def read_cross_vault_random_image_file(
    playlist_id: int,
    target_monitor: Optional[str] = Query("all"),
    log_rotation: bool = Query(True),
    db: AsyncSession = Depends(get_db)
) -> Response:
    """Fetch and proxy a random image file from a cross-vault playlist."""
    playlist = await crud_playlist.get_playlist(db, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if not playlist.is_cross_vault:
        raise HTTPException(status_code=400, detail="This playlist is not a cross-vault playlist")
    
    online_vault_ids = get_online_vault_ids()
    cvi = await crud_cross_vault.get_random_image(db, playlist_id, online_vault_ids=online_vault_ids if online_vault_ids else None)
    if cvi is None:
        raise HTTPException(status_code=404, detail="No online images found in this cross-vault playlist")
    
    return await _proxy_remote_image_file(
        vault_id=cvi.vault_id,
        image_id=cvi.image_id,
        db=db,
        target_monitor=target_monitor,
        log_rot=log_rotation,
    )


@router.get("/{playlist_id}/cross-vault/random/file/{ratio}/image.jpg")
async def read_cross_vault_random_image_file_path(
    playlist_id: int,
    ratio: str,
    target_monitor: Optional[str] = Query("all"),
    log_rotation: bool = Query(True),
    db: AsyncSession = Depends(get_db)
) -> Response:
    """Fetch and proxy a random image file from a cross-vault playlist (DisplayFusion compatible)."""
    playlist = await crud_playlist.get_playlist(db, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if not playlist.is_cross_vault:
        raise HTTPException(status_code=400, detail="This playlist is not a cross-vault playlist")
    
    online_vault_ids = get_online_vault_ids()
    cvi = await crud_cross_vault.get_random_image(db, playlist_id, online_vault_ids=online_vault_ids if online_vault_ids else None)
    if cvi is None:
        raise HTTPException(status_code=404, detail="No online images found in this cross-vault playlist")
    
    return await _proxy_remote_image_file(
        vault_id=cvi.vault_id,
        image_id=cvi.image_id,
        db=db,
        aspect_ratio=ratio,
        target_monitor=target_monitor,
        log_rot=log_rotation,
    )


# --- Standard Playlist Random Endpoints ---

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
    if playlist.is_cross_vault:
        raise HTTPException(status_code=400, detail="For cross-vault playlists, use /cross-vault/random or /cross-vault/random/file")
        
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
) -> Response:
    """Get a random image file from a playlist, with optional filters (DisplayFusion compatible)."""
    playlist = await crud_playlist.get_playlist(db, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
        
    if playlist.is_cross_vault:
        online_vault_ids = get_online_vault_ids()
        cvi = await crud_cross_vault.get_random_image(db, playlist_id, online_vault_ids=online_vault_ids if online_vault_ids else None)
        if cvi is None:
            raise HTTPException(status_code=404, detail="No online images found in this cross-vault playlist")
        return await _proxy_remote_image_file(
            vault_id=cvi.vault_id,
            image_id=cvi.image_id,
            db=db,
            aspect_ratio=ratio,
            target_monitor=target_monitor,
            log_rot=log_rotation,
        )

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
    log_rotation: bool = Query(True),
    target_monitor: Optional[str] = Query("all"),
    db: AsyncSession = Depends(get_db)
) -> Response:
    """Get a random image file from a playlist based on ratio in the path (DisplayFusion compatible)."""
    playlist = await crud_playlist.get_playlist(db, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
        
    if playlist.is_cross_vault:
        online_vault_ids = get_online_vault_ids()
        cvi = await crud_cross_vault.get_random_image(db, playlist_id, online_vault_ids=online_vault_ids if online_vault_ids else None)
        if cvi is None:
            raise HTTPException(status_code=404, detail="No online images found in this cross-vault playlist")
        return await _proxy_remote_image_file(
            vault_id=cvi.vault_id,
            image_id=cvi.image_id,
            db=db,
            aspect_ratio=ratio,
            target_monitor=target_monitor,
            log_rot=log_rotation,
        )

    db_image = await crud_image.get_random_image(
        db,
        aspect_ratio_label=ratio,
        playlist_id=playlist_id
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

@router.get("/{playlist_id}/random/file/{ratio}/tags/{tags:path}/image.jpg")
async def read_playlist_random_image_file_path_tags(
    playlist_id: int,
    ratio: str,
    tags: str,
    log_rotation: bool = Query(True),
    target_monitor: Optional[str] = Query("all"),
    db: AsyncSession = Depends(get_db)
) -> Response:
    """Get a random image file from a playlist based on ratio and tags in the path (DisplayFusion compatible)."""
    playlist = await crud_playlist.get_playlist(db, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
        
    if playlist.is_cross_vault:
        online_vault_ids = get_online_vault_ids()
        cvi = await crud_cross_vault.get_random_image(db, playlist_id, online_vault_ids=online_vault_ids if online_vault_ids else None)
        if cvi is None:
            raise HTTPException(status_code=404, detail="No online images found in this cross-vault playlist")
        return await _proxy_remote_image_file(
            vault_id=cvi.vault_id,
            image_id=cvi.image_id,
            db=db,
            aspect_ratio=ratio,
            target_monitor=target_monitor,
            log_rot=log_rotation,
        )

    tag_list = [t.strip() for t in tags.split("/") if t.strip()]
    db_image = await crud_image.get_random_image(
        db,
        aspect_ratio_label=ratio,
        tags=tag_list,
        playlist_id=playlist_id
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
