"""
In-memory registry for tracking health, URL, and API key details of remote vaults.
Populated via periodic health updates pushed from Electron or API callers.
"""
from datetime import datetime, timezone
from typing import Dict, Optional, List
from pydantic import BaseModel, Field

class VaultHealthEntry(BaseModel):
    vault_id: str = Field(..., description="Unique UUID identifier of the vault")
    url: str = Field(..., description="Base URL of the vault backend")
    is_online: bool = Field(..., description="Whether the vault is reachable")
    vault_name: Optional[str] = Field(None, description="Display name / label of the vault")
    api_key: Optional[str] = Field(None, description="API key to communicate with this vault")
    last_seen: Optional[datetime] = Field(None, description="Timestamp of the last successful health ping")

class VaultHealthUpdate(BaseModel):
    vault_id: str = Field(..., description="Unique UUID identifier of the vault")
    url: str = Field(..., description="Base URL of the vault backend")
    is_online: bool = Field(..., description="Whether the vault is reachable")
    vault_name: Optional[str] = Field(None, description="Display name / label of the vault")
    api_key: Optional[str] = Field(None, description="API key to communicate with this vault")

# In-memory dictionary storing current health state for all remote/known vaults
_vault_health: Dict[str, VaultHealthEntry] = {}

def update_vault_health_entries(updates: List[VaultHealthUpdate]) -> None:
    """Updates or inserts health entries in the in-memory registry."""
    now = datetime.now(timezone.utc)
    for update in updates:
        existing = _vault_health.get(update.vault_id)
        last_seen = now if update.is_online else (existing.last_seen if existing else None)
        _vault_health[update.vault_id] = VaultHealthEntry(
            vault_id=update.vault_id,
            url=update.url.rstrip("/"),
            is_online=update.is_online,
            vault_name=update.vault_name or (existing.vault_name if existing else None),
            api_key=update.api_key or (existing.api_key if existing else None),
            last_seen=last_seen,
        )

def get_online_vault_ids() -> set[str]:
    """Returns the set of vault_ids currently marked as online."""
    return {vault_id for vault_id, entry in _vault_health.items() if entry.is_online}

def get_vault_url(vault_id: str) -> Optional[str]:
    """Returns the base URL for a given vault_id if registered."""
    entry = _vault_health.get(vault_id)
    return entry.url if entry else None

def get_vault_api_key(vault_id: str) -> Optional[str]:
    """Returns the API key for a given vault_id if registered."""
    entry = _vault_health.get(vault_id)
    return entry.api_key if entry else None

def get_vault_health(vault_id: str) -> Optional[VaultHealthEntry]:
    """Returns the health entry for a given vault_id."""
    return _vault_health.get(vault_id)

def get_all_vault_health() -> Dict[str, VaultHealthEntry]:
    """Returns all registered vault health entries."""
    return _vault_health.copy()
