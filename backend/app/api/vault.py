"""
API endpoints for vault identity and metadata.
"""
import socket
import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.crud import settings as crud_settings
from app.schemas.vault import VaultIdentityResponse
from app.schemas.settings import SettingUpdate
from app.core.config import settings

router = APIRouter()


@router.get("/identity", response_model=VaultIdentityResponse)
async def get_vault_identity(
    db: AsyncSession = Depends(get_db)
) -> VaultIdentityResponse:
    """
    Retrieve unique identity and metadata for this vault instance.
    """
    vault_id_setting = await crud_settings.get_setting(db, key="vault_id")
    if not vault_id_setting or not vault_id_setting.value:
        new_id = str(uuid.uuid4())
        vault_id_setting = await crud_settings.update_setting(
            db, key="vault_id", setting=SettingUpdate(value=new_id, description="Unique identifier for this vault instance")
        )
        await db.commit()

    vault_name_setting = await crud_settings.get_setting(db, key="vault_name")
    if not vault_name_setting or not vault_name_setting.value:
        default_name = socket.gethostname() or "Local Vault"
        vault_name_setting = await crud_settings.update_setting(
            db, key="vault_name", setting=SettingUpdate(value=default_name, description="Display name for this vault instance")
        )
        await db.commit()

    return VaultIdentityResponse(
        vault_id=vault_id_setting.value,
        vault_name=vault_name_setting.value,
        version=settings.VERSION,
    )
