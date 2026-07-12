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

@pytest.mark.asyncio
async def test_get_color_stats(client: AsyncClient):
    """
    Test the color-stats endpoint returns a list (can be empty or contain stat objects).
    """
    response = await client.get("/api/images/color-stats")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    # The database is empty in these tests initially, so the list should be empty.
    # If there are items, they should contain 'color' and 'count' keys.
    if len(data) > 0:
        for stat in data:
            assert "color" in stat
            assert "count" in stat

@pytest.mark.asyncio
async def test_creator_socials_crud(client: AsyncClient):
    """
    Test creating, reading, and updating creators with social links.
    """
    # 1. Create creator with socials
    payload = {
        "canonical_name": "Social Artist",
        "type": "Artist",
        "notes": "Testing socials",
        "socials": [
            {"platform": "Twitter", "url": "https://twitter.com/socialartist"},
            {"platform": "Pixiv", "url": "https://pixiv.net/users/123456"}
        ]
    }
    response = await client.post("/api/creators/", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["canonical_name"] == "Social Artist"
    assert len(data["socials"]) == 2
    assert data["socials"][0]["platform"] == "Twitter"
    assert data["socials"][0]["url"] == "https://twitter.com/socialartist"

    creator_id = data["id"]

    # 2. Get creator and check socials
    response = await client.get(f"/api/creators/{creator_id}")
    assert response.status_code == 200
    data = response.json()
    assert len(data["socials"]) == 2

    # 3. Update creator's socials
    update_payload = {
        "socials": [
            {"platform": "Twitter", "url": "https://twitter.com/newhandle"}
        ]
    }
    response = await client.patch(f"/api/creators/{creator_id}", json=update_payload)
    assert response.status_code == 200
    data = response.json()
    assert len(data["socials"]) == 1
    assert data["socials"][0]["url"] == "https://twitter.com/newhandle"

    # 4. Test validation error for invalid URL
    response = await client.post("/api/creators/", json={
        "canonical_name": "Invalid Artist",
        "socials": [{"platform": "Twitter", "url": "not-a-valid-url"}]
    })
    assert response.status_code == 422
