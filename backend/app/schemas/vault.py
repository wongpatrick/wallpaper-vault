"""
Pydantic schemas for vault identity.
"""
from pydantic import BaseModel, Field


class VaultIdentityResponse(BaseModel):
    vault_id: str = Field(..., description="Unique UUID identifier for this vault backend.")
    vault_name: str = Field(..., description="Configured display name of this vault backend.")
    version: str = Field(..., description="API version of the backend.")
