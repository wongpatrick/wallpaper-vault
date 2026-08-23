import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_vault_identity(client: AsyncClient):
    res = await client.get("/api/vault/identity")
    assert res.status_code == 200
    data = res.json()
    assert "vault_id" in data
    assert len(data["vault_id"]) > 0
    assert "vault_name" in data
    assert len(data["vault_name"]) > 0
    assert data["version"] == "0.1.0"


@pytest.mark.asyncio
async def test_update_vault_name(client: AsyncClient):
    # Update vault_name via settings
    update_res = await client.put(
        "/api/settings/vault_name",
        json={"value": "My Custom NAS Vault", "description": "Customized NAS name"}
    )
    assert update_res.status_code == 200

    # Verify identity endpoint returns the new name
    res = await client.get("/api/vault/identity")
    assert res.status_code == 200
    data = res.json()
    assert data["vault_name"] == "My Custom NAS Vault"
