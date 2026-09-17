import pytest
from httpx import AsyncClient, Response
from unittest.mock import patch, AsyncMock
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.vault_health import update_vault_health_entries, VaultHealthUpdate

@pytest.mark.asyncio
async def test_cross_vault_playlist_lifecycle(client: AsyncClient, db_session: AsyncSession):
    # 1. Create a cross-vault playlist
    resp = await client.post("/api/playlists", json={
        "name": "Cross Vault Favorites",
        "description": "Multi-vault collection",
        "is_cross_vault": True
    })
    assert resp.status_code == 200
    pl = resp.json()
    assert pl["name"] == "Cross Vault Favorites"
    assert pl["is_cross_vault"] is True
    assert pl["image_count"] == 0
    playlist_id = pl["id"]

    # 2. Add cross-vault images
    resp = await client.post(f"/api/playlists/{playlist_id}/cross-vault-images", json={
        "images": [
            {"vault_id": "vault-uuid-1", "image_id": 101},
            {"vault_id": "vault-uuid-2", "image_id": 202},
            {"vault_id": "vault-uuid-1", "image_id": 103},
        ]
    })
    assert resp.status_code == 200
    assert resp.json()["added_count"] == 3

    # 3. Adding duplicates should be ignored
    resp = await client.post(f"/api/playlists/{playlist_id}/cross-vault-images", json={
        "images": [
            {"vault_id": "vault-uuid-1", "image_id": 101},
            {"vault_id": "vault-uuid-2", "image_id": 303},
        ]
    })
    assert resp.status_code == 200
    assert resp.json()["added_count"] == 1

    # 4. Get playlist details
    resp = await client.get(f"/api/playlists/{playlist_id}")
    assert resp.status_code == 200
    detail = resp.json()
    assert detail["is_cross_vault"] is True
    assert detail["image_count"] == 4
    assert len(detail["cross_vault_images"]) == 4
    assert detail["cross_vault_images"][0]["vault_id"] == "vault-uuid-1"
    assert detail["cross_vault_images"][0]["image_id"] == 101
    assert detail["cross_vault_images"][0]["sort_order"] == 0

    # 5. Read cross-vault images endpoint
    resp = await client.get(f"/api/playlists/{playlist_id}/cross-vault-images")
    assert resp.status_code == 200
    images = resp.json()
    assert len(images) == 4

    # 6. Reorder cross-vault images
    reordered_payload = [
        {"vault_id": "vault-uuid-2", "image_id": 303},
        {"vault_id": "vault-uuid-1", "image_id": 103},
        {"vault_id": "vault-uuid-2", "image_id": 202},
        {"vault_id": "vault-uuid-1", "image_id": 101},
    ]
    resp = await client.put(f"/api/playlists/{playlist_id}/cross-vault-images/reorder", json={
        "images": reordered_payload
    })
    assert resp.status_code == 200

    resp = await client.get(f"/api/playlists/{playlist_id}/cross-vault-images")
    images = resp.json()
    assert images[0]["vault_id"] == "vault-uuid-2"
    assert images[0]["image_id"] == 303
    assert images[0]["sort_order"] == 0
    assert images[3]["vault_id"] == "vault-uuid-1"
    assert images[3]["image_id"] == 101
    assert images[3]["sort_order"] == 3

    # 7. Remove cross-vault images
    resp = await client.request(
        "DELETE",
        f"/api/playlists/{playlist_id}/cross-vault-images",
        json={"images": [{"vault_id": "vault-uuid-1", "image_id": 103}]}
    )
    assert resp.status_code == 200
    assert resp.json()["removed_count"] == 1

    resp = await client.get(f"/api/playlists/{playlist_id}")
    assert resp.json()["image_count"] == 3

    # 8. Delete playlist
    resp = await client.delete(f"/api/playlists/{playlist_id}")
    assert resp.status_code == 200

@pytest.mark.asyncio
async def test_vault_health_and_cross_vault_rotation(client: AsyncClient, db_session: AsyncSession):
    # Register vault health status
    update_vault_health_entries([
        VaultHealthUpdate(
            vault_id="v-online",
            url="http://remote-vault-1:8000",
            is_online=True,
            vault_name="Remote Vault 1",
            api_key="secret-key-1"
        ),
        VaultHealthUpdate(
            vault_id="v-offline",
            url="http://remote-vault-2:8000",
            is_online=False,
            vault_name="Remote Vault 2",
            api_key="secret-key-2"
        ),
    ])

    # Check health endpoint
    resp = await client.get("/api/vault/health")
    assert resp.status_code == 200
    health = resp.json()
    assert health["v-online"]["is_online"] is True
    assert health["v-online"]["url"] == "http://remote-vault-1:8000"
    assert health["v-offline"]["is_online"] is False

    # Create cross vault playlist with items from both vaults
    resp = await client.post("/api/playlists", json={
        "name": "Rotation Multi-Vault",
        "is_cross_vault": True
    })
    pl_id = resp.json()["id"]

    await client.post(f"/api/playlists/{pl_id}/cross-vault-images", json={
        "images": [
            {"vault_id": "v-online", "image_id": 55},
            {"vault_id": "v-offline", "image_id": 99},
        ]
    })

    # Test random selection - should pick only from online vault (v-online)
    resp = await client.get(f"/api/playlists/{pl_id}/cross-vault/random")
    assert resp.status_code == 200
    rand_ref = resp.json()
    assert rand_ref["vault_id"] == "v-online"
    assert rand_ref["image_id"] == 55

    # Mock proxying remote image bytes
    from app.models.rotation_history import RotationHistory
    from sqlalchemy import select, func

    async def get_rotation_count() -> int:
        res = await db_session.execute(select(func.count()).select_from(RotationHistory))
        return res.scalar_one()

    initial_rotations = await get_rotation_count()

    mock_resp = Response(
        status_code=200,
        content=b"FAKE_IMAGE_BYTES",
        headers={"content-type": "image/jpeg"}
    )
    mock_client_instance = AsyncMock()
    mock_client_instance.get.return_value = mock_resp
    mock_client_instance.__aenter__.return_value = mock_client_instance
    mock_client_instance.__aexit__.return_value = None

    with patch("app.api.cross_vault_playlists.httpx.AsyncClient", return_value=mock_client_instance):
        # 1. Calling cross-vault random file without log_rotation param defaults to False
        file_resp = await client.get(f"/api/playlists/{pl_id}/cross-vault/random/file")
        assert file_resp.status_code == 200
        assert file_resp.content == b"FAKE_IMAGE_BYTES"
        assert file_resp.headers["content-type"] == "image/jpeg"
        assert await get_rotation_count() == initial_rotations

        # 2. Also test via standard random file route with explicit log_rotation=false
        std_file_resp = await client.get(f"/api/playlists/{pl_id}/random/file?log_rotation=false")
        assert std_file_resp.status_code == 200
        assert std_file_resp.content == b"FAKE_IMAGE_BYTES"
        assert await get_rotation_count() == initial_rotations

        # 3. Also test DisplayFusion path route with explicit log_rotation=false
        df_resp = await client.get(f"/api/playlists/{pl_id}/cross-vault/random/file/16:9/image.jpg?log_rotation=false")
        assert df_resp.status_code == 200
        assert df_resp.content == b"FAKE_IMAGE_BYTES"
        assert await get_rotation_count() == initial_rotations

        # 4. Calling cross-vault random file with log_rotation=true DOES log rotation with remote vault details
        rot_resp = await client.get(f"/api/playlists/{pl_id}/cross-vault/random/file?log_rotation=true")
        assert rot_resp.status_code == 200
        assert await get_rotation_count() == initial_rotations + 1

        history_stmt = select(RotationHistory).order_by(RotationHistory.id.desc()).limit(1)
        history_res = await db_session.execute(history_stmt)
        latest_entry = history_res.scalar_one()
        assert latest_entry.vault_id == "v-online"
        assert latest_entry.vault_image_id == 55
        assert latest_entry.image_id is None
