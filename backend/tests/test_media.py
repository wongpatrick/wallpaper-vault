import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_tags_api_unique(client: AsyncClient):
    """
    Test the tags endpoint retrieves unique tags across images.
    """
    # Setup data
    resp = await client.post("/api/creators/", json={"canonical_name": "Tag Artist"})
    creator_id = resp.json()["id"]

    await client.post("/api/sets/", json={"title": "Tag Set", "creator_ids": [creator_id], "local_path": "/tmp/tag_set", "tags": ["nature", "dark"]})
    await client.post("/api/sets/", json={"title": "Tag Set 2", "creator_ids": [creator_id], "local_path": "/tmp/tag_set_2", "tags": ["light", "dark"]})

    # Fetch unique tags
    response = await client.get("/api/tags/")
    assert response.status_code == 200
    tags = response.json()
    assert isinstance(tags, list)
    assert sorted(tags) == sorted(["Dark", "Light", "Nature"])

@pytest.mark.asyncio
async def test_thumbnails_missing_image(client: AsyncClient):
    """
    Test thumbnail endpoints handles missing files gracefully.
    """
    # Create DB record but no physical file
    resp = await client.post("/api/creators/", json={"canonical_name": "Thumb Artist"})
    creator_id = resp.json()["id"]

    resp = await client.post("/api/sets/", json={"title": "Thumb Set", "creator_ids": [creator_id], "local_path": "/tmp/thumb_set"})
    set_id = resp.json()["id"]

    resp = await client.post(f"/api/images/set/{set_id}", json={
        "filename": "missing.jpg", "local_path": "/tmp/thumb_set/missing.jpg", "width": 100, "height": 100
    })
    img_id = resp.json()["id"]

    # Request thumbnail, should 404 because file isn't on disk
    response = await client.get(f"/api/thumbnails/image/{img_id}")
    assert response.status_code == 404

@pytest.mark.asyncio
async def test_random_image_not_found(client: AsyncClient):
    """
    Test random endpoint returns 404 when criteria isn't met.
    """
    response = await client.get("/api/images/random", params={"ratio": "21x9"})
    assert response.status_code == 404
