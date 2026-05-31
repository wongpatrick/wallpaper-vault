"""
API endpoints for managing application settings and configurations.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.crud import settings as crud_settings
from app.schemas import settings as schema_settings

router = APIRouter()

@router.get("/", response_model=List[schema_settings.Setting])
async def read_settings(
    db: AsyncSession = Depends(get_db)
) -> List[schema_settings.Setting]:
    """
    Retrieve all settings.
    """
    return await crud_settings.get_settings(db)

@router.get("/{key}", response_model=schema_settings.Setting)
async def read_setting(
    key: str,
    db: AsyncSession = Depends(get_db)
) -> schema_settings.Setting:
    """
    Get a specific setting by key.
    """
    db_setting = await crud_settings.get_setting(db, key=key)
    if not db_setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    return db_setting

@router.put("/{key}", response_model=schema_settings.Setting)
async def update_setting(
    key: str,
    setting: schema_settings.SettingUpdate,
    db: AsyncSession = Depends(get_db)
) -> schema_settings.Setting:
    """
    Update or create an application configuration setting.
    
    If the setting key already exists, its value and description are updated. If it does not exist, a new configuration key is created. This allows dynamic reconfiguration of paths and app behavior.
    """
    return await crud_settings.update_setting(db, key=key, setting=setting)
