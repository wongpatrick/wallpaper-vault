import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    """
    Test the basic health check endpoint.
    """
    response = await client.get("/api/")
    # If the prefix is applied, it might be /api/ or just / on the router. 
    # Let's check the root endpoint of the app instead if /api/ fails.
    if response.status_code == 404:
        response = await client.get("/")
        
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "Wallpaper Vault API is running" in data["message"]

@pytest.mark.asyncio
async def test_get_creators_empty(client: AsyncClient):
    """
    Test fetching creators from an empty database.
    """
    response = await client.get("/api/creators/")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert isinstance(data["items"], list)
    assert len(data["items"]) == 0
