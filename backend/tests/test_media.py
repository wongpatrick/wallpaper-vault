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
    response = await client.get(f"/api/images/thumb/{img_id}")
    assert response.status_code == 404

@pytest.mark.asyncio
async def test_random_image_not_found(client: AsyncClient):
    """
    Test random endpoint returns 404 when criteria isn't met.
    """
    response = await client.get("/api/images/random", params={"ratio": "21x9"})
    assert response.status_code == 404

@pytest.fixture
def temp_vault():
    import tempfile
    from pathlib import Path
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)

@pytest.mark.asyncio
async def test_delete_image_cleanup_thumbnails(client: AsyncClient, temp_vault):
    """
    Test that deleting an image removes its cached thumbnails from disk.
    """
    import numpy as np
    import cv2
    from pathlib import Path
    from app.api.thumbnails import THUMBS_DIR

    # Set the base library path
    await client.put("/api/settings/base_library_path", json={"value": str(temp_vault)})

    # Create creator and set
    resp = await client.post("/api/creators/", json={"canonical_name": "Delete Artist"})
    creator_id = resp.json()["id"]

    resp = await client.post("/api/sets/", json={
        "title": "Delete Set",
        "creator_ids": [creator_id]
    })
    set_id = resp.json()["id"]
    set_path = Path(resp.json()["local_path"])

    # Add a mock image file
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    img_path = set_path / "delete_test.jpg"
    cv2.imwrite(str(img_path), img)

    # Resync set to scan/register the image
    resp = await client.post(f"/api/sets/{set_id}/resync")
    data = resp.json()
    img_id = data["images"][0]["id"]

    # Request the thumbnail to generate it
    thumb_resp = await client.get(f"/api/images/thumb/{img_id}?size=sm")
    assert thumb_resp.status_code == 200

    # Verify that the thumbnail file exists on disk
    thumb_file = THUMBS_DIR / f"{img_id}_sm.jpg"
    assert thumb_file.exists()

    # Now, delete the image
    del_resp = await client.delete(f"/api/images/{img_id}")
    assert del_resp.status_code == 200

    # Verify that the thumbnail file has been deleted
    assert not thumb_file.exists()
