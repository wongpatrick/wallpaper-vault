"""
API endpoints for wallpaper rotation history, manual skipping, and real-time SSE streaming.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.db.session import get_db
from app.models.rotation_history import RotationHistory
from app.schemas.image import ImageDetail, ImageWithContext
from app.schemas.rotation_history import SetWallpaperRequest, SetWallpaperResponse
from app.api.images import map_image_to_schema, map_image_to_context_schema
from app.core.rotation import rotation_broadcaster
from typing import List, AsyncGenerator
import structlog
from sqlalchemy.orm import selectinload
from app.models.image import Image
from app.models.set import Set

logger = structlog.get_logger(__name__)
router = APIRouter()
MAX_HISTORY_DISPLAY_COUNT = 5


async def _batch_get_images_map(db: AsyncSession, image_ids: list[int]) -> dict[int, Image]:
    """Batch fetch multiple images with their required eager loaded relationships."""
    if not image_ids:
        return {}
    stmt = (
        select(Image)
        .options(
            selectinload(Image.tags),
            selectinload(Image.characters),
            selectinload(Image.set).selectinload(Set.creators),
        )
        .where(Image.id.in_(image_ids))
    )
    res = await db.execute(stmt)
    return {img.id: img for img in res.scalars().all()}


@router.get("/current", response_model=ImageWithContext)
async def read_current_wallpaper(db: AsyncSession = Depends(get_db)) -> ImageWithContext:
    """Fetch the currently active wallpaper (the last served random image)."""
    result = await db.execute(
        select(RotationHistory)
        .order_by(RotationHistory.timestamp.desc())
        .limit(1)
    )
    history_entry = result.scalar_one_or_none()
    if history_entry is None or not history_entry.image_id:
        raise HTTPException(status_code=404, detail="No wallpaper has been served yet")
    
    images_map = await _batch_get_images_map(db, [history_entry.image_id])
    img = images_map.get(history_entry.image_id)
    if img is None:
        raise HTTPException(status_code=404, detail="Active wallpaper image record not found")
        
    return map_image_to_context_schema(img)


@router.get("/history", response_model=List[ImageDetail])
async def read_wallpaper_history(db: AsyncSession = Depends(get_db)) -> List[ImageDetail]:
    """Fetch the last 5 unique wallpapers served in rotation history."""
    result = await db.execute(
        select(RotationHistory)
        .order_by(RotationHistory.id.desc())
        .limit(15)  # Fetch slightly more to account for potential duplicates
    )
    entries = result.scalars().all()
    
    seen_ids: list[int] = []
    for entry in entries:
        if entry.image_id and entry.image_id not in seen_ids:
            seen_ids.append(entry.image_id)
            if len(seen_ids) >= MAX_HISTORY_DISPLAY_COUNT:
                break
            
    if not seen_ids:
        return []

    images_map = await _batch_get_images_map(db, seen_ids)
    return [map_image_to_schema(images_map[img_id]) for img_id in seen_ids if img_id in images_map]


@router.get("/current-monitors", response_model=dict[str, ImageWithContext])
async def read_current_monitors_wallpapers(db: AsyncSession = Depends(get_db)) -> dict[str, ImageWithContext]:
    """Fetch the currently active wallpapers for all monitors and global."""
    from app.models.settings import Setting
    
    # Query all active image settings
    result = await db.execute(
        select(Setting).where(
            Setting.key.like("monitor_%_active_image_id") | (Setting.key == "wallpaper_active_image_id")
        )
    )
    settings = result.scalars().all()
    
    setting_map: dict[str, int] = {}
    for setting in settings:
        try:
            image_id = int(setting.value)
            key = "global" if setting.key == "wallpaper_active_image_id" else setting.key.split("_")[1]
            setting_map[key] = image_id
        except (ValueError, TypeError):
            continue
            
    # Also fetch the overall last rotated image as fallback for "global" if not set
    if "global" not in setting_map:
        result_last = await db.execute(
            select(RotationHistory)
            .order_by(RotationHistory.timestamp.desc())
            .limit(1)
        )
        last_entry = result_last.scalar_one_or_none()
        if last_entry and last_entry.image_id:
            setting_map["global"] = last_entry.image_id

    needed_ids = list(set(setting_map.values()))
    images_map = await _batch_get_images_map(db, needed_ids)

    response = {}
    for key, img_id in setting_map.items():
        if img_id in images_map:
            response[key] = map_image_to_context_schema(images_map[img_id])
                
    return response

@router.post("/set-wallpaper", response_model=SetWallpaperResponse)
async def set_active_wallpaper(
    request: SetWallpaperRequest,
    db: AsyncSession = Depends(get_db)
) -> SetWallpaperResponse:
    """
    Manually apply a wallpaper image as the active wallpaper for a specific monitor or globally.
    """
    from app.crud.image import get_image
    img = await get_image(db, request.image_id)
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    target_monitor = request.target_monitor or "all"
    style = request.style or "fill"

    from app.core.rotation import log_rotation
    await log_rotation(db, image_id=request.image_id, aspect_ratio=img.aspect_ratio_label, target_monitor=target_monitor)

    # Persist the style in settings
    from app.models.settings import Setting
    style_key = f"monitor_{target_monitor}_wallpaper_rotation_style" if target_monitor != "all" else "wallpaper_rotation_style"
    stmt = select(Setting).where(Setting.key == style_key)
    res = await db.execute(stmt)
    setting = res.scalar_one_or_none()
    if setting:
        setting.value = style
    else:
        setting = Setting(key=style_key, value=style, description=f"Wallpaper fit style for {style_key}")
        db.add(setting)
    await db.commit()

    logger.info("Manually set active wallpaper", image_id=request.image_id, target_monitor=target_monitor, style=style)

    return SetWallpaperResponse(
        status="success",
        image_id=request.image_id,
        target_monitor=target_monitor,
        style=style
    )

@router.post("/skip")
async def trigger_skip(target_monitor: str = "all") -> dict[str, str]:
    """Broadcast a skip event to all connected Electron clients."""
    await rotation_broadcaster.broadcast({"event": "skip", "target_monitor": target_monitor})
    logger.info("Broadcasted skip event", target_monitor=target_monitor)
    return {"status": "ok", "message": "Skip event broadcasted"}

@router.get("/events")
async def event_stream() -> StreamingResponse:
    """Server-Sent Events (SSE) endpoint to stream rotation and skip events to clients."""
    async def sse_generator() -> AsyncGenerator[str, None]:
        queue = rotation_broadcaster.subscribe()
        try:
            # Send an initial sync signal
            yield "data: {\"event\": \"ping\"}\n\n"
            while True:
                message = await queue.get()
                yield f"data: {message}\n\n"
        finally:
            rotation_broadcaster.unsubscribe(queue)
            
    return StreamingResponse(sse_generator(), media_type="text/event-stream")
