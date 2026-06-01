import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_core_user_flow(client: AsyncClient):
    """
    Test the core user flow:
    1. Create a Creator
    2. Create a Set
    3. Add an Image
    4. Fetch and Verify
    5. Delete
    """
    
    # 1. Create a Creator
    creator_payload = {
        "canonical_name": "Test Core Artist",
        "creator_type": "illustrator"
    }
    response = await client.post("/api/creators/", json=creator_payload)
    assert response.status_code == 200, f"Failed to create creator: {response.text}"
    creator = response.json()
    assert "id" in creator
    assert creator["canonical_name"] == "Test Core Artist"
    creator_id = creator["id"]

    # 2. Create a Set
    set_payload = {
        "title": "My Awesome Test Set",
        "creator_ids": [creator_id],
        "local_path": "/path/to/my/awesome/set"
    }
    response = await client.post("/api/sets/", json=set_payload)
    assert response.status_code == 200, f"Failed to create set: {response.text}"
    test_set = response.json()
    assert "id" in test_set
    assert test_set["title"] == "My Awesome Test Set"
    set_id = test_set["id"]

    # Verify the Set is linked to the creator
    response = await client.get(f"/api/creators/{creator_id}")
    assert response.status_code == 200
    fetched_creator = response.json()
    # Pydantic schema for CreatorWithSets has a 'sets' field
    assert "sets" in fetched_creator
    set_ids = [s["id"] for s in fetched_creator["sets"]]
    assert set_id in set_ids

    # 3. Add an Image to the Set
    image_payload = {
        "filename": "test_image_123.jpg",
        "local_path": "/path/to/my/awesome/set/test_image_123.jpg",
        "width": 1920,
        "height": 1080,
        "aspect_ratio": 1920 / 1080,
        "aspect_ratio_label": "16x9",
        "file_size": 1024000
    }
    response = await client.post(f"/api/images/set/{set_id}", json=image_payload)
    assert response.status_code == 200, f"Failed to add image: {response.text}"
    image = response.json()
    assert "id" in image
    assert image["set_id"] == set_id
    image_id = image["id"]

    # 4. Fetch and Verify via Image Search
    response = await client.get("/api/images/", params={"search": "test_image_123"})
    assert response.status_code == 200
    page = response.json()
    assert "items" in page
    assert len(page["items"]) == 1
    fetched_image = page["items"][0]
    
    # Assert context mapping is correct
    assert fetched_image["set_title"] == "My Awesome Test Set"
    assert "Test Core Artist" in fetched_image["creator_names"]

    # 5. Teardown (Delete)
    # Delete Image
    response = await client.delete(f"/api/images/{image_id}")
    assert response.status_code == 200

    # Verify Image is gone
    response = await client.get(f"/api/images/{image_id}")
    assert response.status_code == 404

    # Delete Set
    response = await client.delete(f"/api/sets/{set_id}")
    assert response.status_code == 200

    # Verify Set is gone
    response = await client.get(f"/api/sets/{set_id}")
    assert response.status_code == 404

    # Delete Creator
    response = await client.delete(f"/api/creators/{creator_id}")
    assert response.status_code == 200

    # Verify Creator is gone
    response = await client.get(f"/api/creators/{creator_id}")
    assert response.status_code == 404
