"""
Desktop wallpaper rotation history helper and real-time SSE broadcaster.
"""
import json
import asyncio
from typing import Optional, Dict, Any, Set
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.rotation_history import RotationHistory

class RotationBroadcaster:
    def __init__(self):
        self.subscribers: Set[asyncio.Queue] = set()

    def subscribe(self) -> asyncio.Queue:
        queue = asyncio.Queue()
        self.subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self.subscribers.discard(queue)

    async def broadcast(self, event_data: Dict[str, Any]) -> None:
        if not self.subscribers:
            return
        
        message = json.dumps(event_data)
        for queue in self.subscribers:
            await queue.put(message)

rotation_broadcaster = RotationBroadcaster()

async def log_rotation(
    db: AsyncSession,
    image_id: Optional[int] = None,
    aspect_ratio: Optional[str] = None,
    target_monitor: Optional[str] = "all",
    vault_id: Optional[str] = None,
    vault_image_id: Optional[int] = None,
) -> None:
    """Logs a rotation event to the database and broadcasts it to all connected SSE clients."""
    # Write the history record
    history_entry = RotationHistory(
        image_id=image_id,
        aspect_ratio=aspect_ratio,
        vault_id=vault_id,
        vault_image_id=vault_image_id,
    )
    db.add(history_entry)
    await db.commit()
    await db.refresh(history_entry)
    
    # Save the active image ID for this monitor in the settings registry so it persists across refreshes
    from app.models.settings import Setting
    from sqlalchemy import select
    
    active_val = str(image_id) if image_id is not None else (f"{vault_id}:{vault_image_id}" if vault_id else "")
    if active_val:
        keys_to_update = ["wallpaper_active_image_id"]
        if target_monitor is not None and target_monitor != "all":
            keys_to_update.append(f"monitor_{target_monitor}_active_image_id")
            
        for key in keys_to_update:
            stmt = select(Setting).where(Setting.key == key)
            res = await db.execute(stmt)
            setting = res.scalar_one_or_none()
            if setting:
                setting.value = active_val
            else:
                setting = Setting(key=key, value=active_val, description=f"Active image ID for {key}")
                db.add(setting)
                
        await db.commit()
    
    if image_id is not None:
        # Import locally to avoid circular dependencies
        from app.crud.image import get_image
        from app.api.mappers import map_image_to_context_schema
        
        db_image = await get_image(db, image_id)
        if db_image:
            schema_img = map_image_to_context_schema(db_image)
            await rotation_broadcaster.broadcast({
                "event": "rotation",
                "image": schema_img.model_dump(),
                "target_monitor": target_monitor
            })
    elif vault_id is not None and vault_image_id is not None:
        await rotation_broadcaster.broadcast({
            "event": "rotation",
            "is_cross_vault": True,
            "vault_id": vault_id,
            "vault_image_id": vault_image_id,
            "aspect_ratio": aspect_ratio,
            "target_monitor": target_monitor
        })

