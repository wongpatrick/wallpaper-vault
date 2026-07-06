"""
API endpoints for wallpaper rotation history, manual skipping, and real-time SSE streaming.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.db.session import get_db
from app.models.rotation_history import RotationHistory
from app.schemas.image import ImageDetail
from app.api.images import map_image_to_schema
from app.core.rotation import rotation_broadcaster
from typing import List, AsyncGenerator
import structlog

logger = structlog.get_logger(__name__)
router = APIRouter()

@router.get("/current", response_model=ImageDetail)
async def read_current_wallpaper(db: AsyncSession = Depends(get_db)) -> ImageDetail:
    """Fetch the currently active wallpaper (the last served random image)."""
    result = await db.execute(
        select(RotationHistory)
        .order_by(RotationHistory.timestamp.desc())
        .limit(1)
    )
    history_entry = result.scalar_one_or_none()
    if history_entry is None:
        raise HTTPException(status_code=404, detail="No wallpaper has been served yet")
    
    from app.crud.image import get_image
    img = await get_image(db, history_entry.image_id)
    if img is None:
        raise HTTPException(status_code=404, detail="Active wallpaper image record not found")
        
    return map_image_to_schema(img)

@router.get("/history", response_model=List[ImageDetail])
async def read_wallpaper_history(db: AsyncSession = Depends(get_db)) -> List[ImageDetail]:
    """Fetch the last 5 unique wallpapers served in rotation history."""
    result = await db.execute(
        select(RotationHistory)
        .order_by(RotationHistory.id.desc())
        .limit(15)  # Fetch slightly more to account for potential duplicates
    )
    entries = result.scalars().all()
    
    from app.crud.image import get_image
    images = []
    seen_ids = set()
    
    for entry in entries:
        if entry.image_id in seen_ids:
            continue
        seen_ids.add(entry.image_id)
        img = await get_image(db, entry.image_id)
        if img:
            images.append(map_image_to_schema(img))
        if len(images) >= 5:
            break
            
    return images

@router.get("/current-monitors", response_model=dict[str, ImageDetail])
async def read_current_monitors_wallpapers(db: AsyncSession = Depends(get_db)) -> dict[str, ImageDetail]:
    """Fetch the currently active wallpapers for all monitors and global."""
    from app.models.settings import Setting
    from app.crud.image import get_image
    
    # Query all active image settings
    result = await db.execute(
        select(Setting).where(
            Setting.key.like("monitor_%_active_image_id") | (Setting.key == "wallpaper_active_image_id")
        )
    )
    settings = result.scalars().all()
    
    response = {}
    for setting in settings:
        image_id_str = setting.value
        try:
            image_id = int(image_id_str)
        except ValueError:
            continue
            
        img = await get_image(db, image_id)
        if img:
            key = "global" if setting.key == "wallpaper_active_image_id" else setting.key.split("_")[1]
            response[key] = map_image_to_schema(img)
            
    # Also fetch the overall last rotated image as fallback for "global" if not set
    if "global" not in response:
        result_last = await db.execute(
            select(RotationHistory)
            .order_by(RotationHistory.timestamp.desc())
            .limit(1)
        )
        last_entry = result_last.scalar_one_or_none()
        if last_entry:
            img = await get_image(db, last_entry.image_id)
            if img:
                response["global"] = map_image_to_schema(img)
                
    return response

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
