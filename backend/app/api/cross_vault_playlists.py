"""
API router for Cross-Vault Playlist endpoints and remote proxying.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.core.vault_health import (
    get_online_vault_ids,
    get_vault_api_key,
    get_vault_health,
    get_vault_url,
)
from app.crud import cross_vault_playlist as crud_cross_vault
from app.crud import playlist as crud_playlist
from app.db.session import get_db
from app.schemas.playlist import (
    CrossVaultImageDetail,
    CrossVaultImageRef,
    CrossVaultImagesAdd,
    CrossVaultImagesRemove,
    CrossVaultImagesReorder,
)

logger = structlog.get_logger(__name__)

router = APIRouter()


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
        raise HTTPException(
            status_code=502,
            detail=f"Source vault '{vault_id}' base URL is not registered or known",
        )

    api_key = get_vault_api_key(vault_id)
    headers = {}
    if api_key:
        headers["X-API-Key"] = api_key

    file_url = f"{vault_url}/api/images/file/{image_id}"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(file_url, headers=headers)
            if resp.status_code != status.HTTP_200_OK:
                raise HTTPException(
                    status_code=resp.status_code,
                    detail=f"Remote vault returned status {resp.status_code}",
                )

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
            return Response(
                content=resp.content,
                media_type=content_type,
                headers={"Content-Disposition": "inline"},
            )
    except httpx.RequestError as exc:
        logger.error(
            "Failed to proxy image file from remote vault",
            vault_id=vault_id,
            image_id=image_id,
            error=str(exc),
        )
        raise HTTPException(
            status_code=502,
            detail=f"Failed to communicate with remote vault: {str(exc)}",
        )


@router.get(
    "/{playlist_id}/cross-vault-images",
    response_model=List[CrossVaultImageDetail],
)
async def read_cross_vault_images(
    playlist_id: int, db: AsyncSession = Depends(get_db)
) -> List[CrossVaultImageDetail]:
    """Get all cross-vault image references in a cross-vault playlist."""
    playlist = await crud_playlist.get_playlist(db, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if not playlist.is_cross_vault:
        raise HTTPException(
            status_code=400, detail="This playlist is not a cross-vault playlist"
        )

    images = await crud_cross_vault.get_images(db, playlist_id)
    result = []
    for cvi in images:
        vh = get_vault_health(cvi.vault_id)
        result.append(
            CrossVaultImageDetail(
                vault_id=cvi.vault_id,
                image_id=cvi.image_id,
                sort_order=cvi.sort_order,
                vault_label=vh.vault_name if vh else None,
            )
        )
    return result


@router.post("/{playlist_id}/cross-vault-images", response_model=dict)
async def add_cross_vault_images(
    playlist_id: int,
    payload: CrossVaultImagesAdd,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Add a list of cross-vault image references to a cross-vault playlist."""
    playlist = await crud_playlist.get_playlist(db, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if not playlist.is_cross_vault:
        raise HTTPException(
            status_code=400, detail="This playlist is not a cross-vault playlist"
        )

    added = await crud_cross_vault.add_images(db, playlist_id, payload.images)
    await db.commit()
    return {
        "message": f"Successfully added {len(added)} cross-vault images",
        "added_count": len(added),
    }


@router.delete("/{playlist_id}/cross-vault-images", response_model=dict)
async def remove_cross_vault_images(
    playlist_id: int,
    payload: CrossVaultImagesRemove,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Remove a list of cross-vault image references from a cross-vault playlist."""
    playlist = await crud_playlist.get_playlist(db, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if not playlist.is_cross_vault:
        raise HTTPException(
            status_code=400, detail="This playlist is not a cross-vault playlist"
        )

    removed_count = await crud_cross_vault.remove_images(
        db, playlist_id, payload.images
    )
    await db.commit()
    return {
        "message": f"Successfully removed {removed_count} cross-vault images",
        "removed_count": removed_count,
    }


@router.put("/{playlist_id}/cross-vault-images/reorder", response_model=dict)
async def reorder_cross_vault_images(
    playlist_id: int,
    payload: CrossVaultImagesReorder,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Reorder cross-vault images within a playlist."""
    playlist = await crud_playlist.get_playlist(db, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if not playlist.is_cross_vault:
        raise HTTPException(
            status_code=400, detail="This playlist is not a cross-vault playlist"
        )

    await crud_cross_vault.reorder_images(db, playlist_id, payload.images)
    await db.commit()
    return {"message": "Successfully reordered cross-vault playlist images"}


@router.get(
    "/{playlist_id}/cross-vault/random", response_model=CrossVaultImageRef
)
async def read_cross_vault_random_image_ref(
    playlist_id: int, db: AsyncSession = Depends(get_db)
) -> CrossVaultImageRef:
    """Get a random cross-vault image reference from a cross-vault playlist, pre-filtering online vaults."""
    playlist = await crud_playlist.get_playlist(db, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if not playlist.is_cross_vault:
        raise HTTPException(
            status_code=400, detail="This playlist is not a cross-vault playlist"
        )

    online_vault_ids = get_online_vault_ids()
    cvi = await crud_cross_vault.get_random_image(
        db,
        playlist_id,
        online_vault_ids=online_vault_ids if online_vault_ids else None,
    )
    if cvi is None:
        raise HTTPException(
            status_code=404,
            detail="No online images found in this cross-vault playlist",
        )

    return CrossVaultImageRef(vault_id=cvi.vault_id, image_id=cvi.image_id)


@router.get("/{playlist_id}/cross-vault/random/file")
async def read_cross_vault_random_image_file(
    playlist_id: int,
    target_monitor: Optional[str] = Query("all"),
    log_rotation: bool = Query(True),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Fetch and proxy a random image file from a cross-vault playlist."""
    playlist = await crud_playlist.get_playlist(db, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if not playlist.is_cross_vault:
        raise HTTPException(
            status_code=400, detail="This playlist is not a cross-vault playlist"
        )

    online_vault_ids = get_online_vault_ids()
    cvi = await crud_cross_vault.get_random_image(
        db,
        playlist_id,
        online_vault_ids=online_vault_ids if online_vault_ids else None,
    )
    if cvi is None:
        raise HTTPException(
            status_code=404,
            detail="No online images found in this cross-vault playlist",
        )

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
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Fetch and proxy a random image file from a cross-vault playlist (DisplayFusion compatible)."""
    playlist = await crud_playlist.get_playlist(db, playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if not playlist.is_cross_vault:
        raise HTTPException(
            status_code=400, detail="This playlist is not a cross-vault playlist"
        )

    online_vault_ids = get_online_vault_ids()
    cvi = await crud_cross_vault.get_random_image(
        db,
        playlist_id,
        online_vault_ids=online_vault_ids if online_vault_ids else None,
    )
    if cvi is None:
        raise HTTPException(
            status_code=404,
            detail="No online images found in this cross-vault playlist",
        )

    return await _proxy_remote_image_file(
        vault_id=cvi.vault_id,
        image_id=cvi.image_id,
        db=db,
        aspect_ratio=ratio,
        target_monitor=target_monitor,
        log_rot=log_rotation,
    )
