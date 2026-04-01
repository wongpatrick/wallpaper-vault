from typing import List, Optional
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.settings import Setting as SettingModel
from app.schemas.settings import SettingCreate, SettingUpdate

async def get_settings(db: AsyncSession) -> List[SettingModel]:
    result = await db.execute(select(SettingModel))
    return result.scalars().all()

async def get_setting(db: AsyncSession, key: str) -> Optional[SettingModel]:
    result = await db.execute(select(SettingModel).filter(SettingModel.key == key))
    return result.scalars().first()

async def update_setting(db: AsyncSession, key: str, setting: SettingUpdate) -> SettingModel:
    db_setting = await get_setting(db, key)
    
    if db_setting:
        db_setting.value = setting.value
        if setting.description is not None:
            db_setting.description = setting.description
    else:
        db_setting = SettingModel(key=key, value=setting.value, description=setting.description)
        db.add(db_setting)
    
    await db.commit()
    await db.refresh(db_setting)
    return db_setting

async def create_setting(db: AsyncSession, setting: SettingCreate) -> SettingModel:
    db_setting = SettingModel(
        key=setting.key,
        value=setting.value,
        description=setting.description
    )
    db.add(db_setting)
    await db.commit()
    await db.refresh(db_setting)
    return db_setting
