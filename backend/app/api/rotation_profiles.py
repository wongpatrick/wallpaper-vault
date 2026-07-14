"""
API endpoints for managing wallpaper rotation configuration profiles.
Provides listing, saving current configuration, applying, and deleting.
"""
import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
import structlog

from app.db.session import get_db
from app.models.rotation_profile import RotationProfile as RotationProfileModel
from app.models.settings import Setting as SettingModel
from app.schemas import rotation_profile as schema
from app.core.rotation import rotation_broadcaster
from pydantic import BaseModel, Field

logger = structlog.get_logger(__name__)

router = APIRouter()

class ProfileCreateRequest(BaseModel):
    name: str = Field(..., description="The name of the new profile to save.")

@router.get("/", response_model=List[schema.RotationProfile])
async def list_profiles(
    db: AsyncSession = Depends(get_db)
) -> List[schema.RotationProfile]:
    """
    Retrieve all saved rotation configuration profiles.
    """
    result = await db.execute(select(RotationProfileModel).order_by(RotationProfileModel.name))
    return result.scalars().all()

@router.post("/", response_model=schema.RotationProfile, status_code=status.HTTP_201_CREATED)
async def save_profile(
    req: ProfileCreateRequest,
    db: AsyncSession = Depends(get_db)
) -> schema.RotationProfile:
    """
    Save the current rotation configuration as a named profile.
    Extracts all rotation-related settings from the settings table.
    """
    name_clean = req.name.strip()
    if not name_clean:
        raise HTTPException(status_code=400, detail="Profile name cannot be empty.")

    # Check if a profile with this name already exists
    existing = await db.execute(
        select(RotationProfileModel).where(RotationProfileModel.name == name_clean)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Profile '{name_clean}' already exists.")

    # Fetch all current settings to extract rotation configurations
    settings_result = await db.execute(select(SettingModel))
    all_settings = settings_result.scalars().all()

    rotation_keys = {
        "wallpaper_rotation_mode",
        "wallpaper_rotation_interval",
        "favorite_rotation_probability",
        "wallpaper_rotation_source",
        "wallpaper_rotation_playlist_id",
        "wallpaper_rotation_target_monitor",
        "wallpaper_rotation_style"
    }

    config_data = {}
    for s in all_settings:
        if s.key in rotation_keys or s.key.startswith("monitor_"):
            # Exclude current active wallpaper IDs from the profile configuration
            if s.key.endswith("_active_image_id") or s.key == "wallpaper_active_image_id":
                continue
            config_data[s.key] = s.value

    config_json_str = json.dumps(config_data)

    new_profile = RotationProfileModel(
        name=name_clean,
        config_json=config_json_str
    )
    db.add(new_profile)
    await db.commit()
    await db.refresh(new_profile)

    logger.info("Saved rotation profile", name=name_clean, keys_count=len(config_data))
    return new_profile

@router.post("/{id}/apply", response_model=schema.RotationProfile)
async def apply_profile(
    id: int,
    db: AsyncSession = Depends(get_db)
) -> schema.RotationProfile:
    """
    Apply a saved rotation profile by ID, writing config settings back into settings table.
    Notifies the Electron native rotation coordinator to refresh settings.
    """
    profile_result = await db.execute(
        select(RotationProfileModel).where(RotationProfileModel.id == id)
    )
    profile = profile_result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found.")

    try:
        config_data = json.loads(profile.config_json)
    except Exception as e:
        logger.error("Failed to parse profile JSON config", error=str(e))
        raise HTTPException(status_code=500, detail="Invalid profile configuration data in database.")

    # 1. Update/insert settings in the database
    for key, val in config_data.items():
        setting_result = await db.execute(
            select(SettingModel).where(SettingModel.key == key)
        )
        db_setting = setting_result.scalar_one_or_none()
        if db_setting:
            db_setting.value = str(val)
        else:
            new_setting = SettingModel(
                key=key,
                value=str(val),
                description=f"Rotation configuration from profile: {profile.name}"
            )
            db.add(new_setting)

    await db.commit()

    # 2. Notify rotation coordinator (Electron) by broadcasting SSE ping event
    await rotation_broadcaster.broadcast({"event": "ping"})
    logger.info("Applied rotation profile and broadcasted ping", name=profile.name)

    return profile

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_profile(
    id: int,
    db: AsyncSession = Depends(get_db)
) -> None:
    """
    Delete a saved rotation profile.
    """
    profile_result = await db.execute(
        select(RotationProfileModel).where(RotationProfileModel.id == id)
    )
    profile = profile_result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found.")

    await db.execute(delete(RotationProfileModel).where(RotationProfileModel.id == id))
    await db.commit()
    logger.info("Deleted rotation profile", id=id, name=profile.name)
