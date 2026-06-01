import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_settings_api(client: AsyncClient):
    """
    Test the settings API endpoints.
    """
    # 1. Update/Create a setting
    payload = {
        "value": "/tmp/vault_test",
        "description": "Test vault directory"
    }
    response = await client.put("/api/settings/base_library_path", json=payload)
    assert response.status_code == 200
    setting = response.json()
    assert setting["key"] == "base_library_path"
    assert setting["value"] == "/tmp/vault_test"

    # 2. Get specific setting
    response = await client.get("/api/settings/base_library_path")
    assert response.status_code == 200
    setting = response.json()
    assert setting["value"] == "/tmp/vault_test"

    # 3. Get all settings
    response = await client.get("/api/settings/")
    assert response.status_code == 200
    settings = response.json()
    assert isinstance(settings, list)
    assert len(settings) >= 1
    assert any(s["key"] == "base_library_path" for s in settings)

@pytest.mark.asyncio
async def test_dashboard_api_empty(client: AsyncClient):
    """
    Test the dashboard API when DB is empty.
    """
    response = await client.get("/api/dashboard/")
    assert response.status_code == 200
    data = response.json()
    assert "stats" in data
    stats = data["stats"]
    assert "total_images" in stats
    assert "total_sets" in stats
    assert "total_creators" in stats
    assert "health_alerts" in data
    
    assert stats["total_images"] == 0
    assert stats["total_sets"] == 0
    assert stats["total_creators"] == 0

@pytest.mark.asyncio
async def test_dashboard_api_with_data(client: AsyncClient):
    """
    Test the dashboard API reflects data changes.
    """
    # Create creator
    resp = await client.post("/api/creators/", json={"canonical_name": "Dash Artist"})
    creator_id = resp.json()["id"]

    # Create set
    resp = await client.post("/api/sets/", json={
        "title": "Dash Set", 
        "creator_ids": [creator_id],
        "local_path": "/tmp/dash"
    })
    set_id = resp.json()["id"]

    # Create image
    await client.post(f"/api/images/set/{set_id}", json={
        "filename": "dash.jpg",
        "local_path": "/tmp/dash/dash.jpg",
        "width": 1920,
        "height": 1080
    })

    # Verify dashboard
    response = await client.get("/api/dashboard/")
    assert response.status_code == 200
    data = response.json()
    stats = data["stats"]
    assert stats["total_images"] == 1
    assert stats["total_sets"] == 1
    assert stats["total_creators"] == 1
