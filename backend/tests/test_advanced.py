import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_bulk_update_and_move_images(client: AsyncClient):
    """
    Test bulk update and bulk move operations for images.
    """
    # Setup: Create Creator, two Sets, and two Images in Set 1
    resp = await client.post("/api/creators/", json={"canonical_name": "Bulk Artist"})
    creator_id = resp.json()["id"]

    resp = await client.post("/api/sets/", json={"title": "Set 1", "creator_ids": [creator_id], "local_path": "/tmp/s1"})
    set1_id = resp.json()["id"]

    resp = await client.post("/api/sets/", json={"title": "Set 2", "creator_ids": [creator_id], "local_path": "/tmp/s2"})
    set2_id = resp.json()["id"]

    resp1 = await client.post(f"/api/images/set/{set1_id}", json={"filename": "img1.jpg", "local_path": "/tmp/s1/img1.jpg", "width": 100, "height": 100})
    img1_id = resp1.json()["id"]

    resp2 = await client.post(f"/api/images/set/{set1_id}", json={"filename": "img2.jpg", "local_path": "/tmp/s1/img2.jpg", "width": 100, "height": 100})
    img2_id = resp2.json()["id"]

    # 1. Bulk Update: append tags
    bulk_update_payload = {
        "image_ids": [img1_id, img2_id],
        "update_data": {"tags": "bulk_tag"},
        "operation_mode": "append"
    }
    resp = await client.post("/api/images/bulk-update", json=bulk_update_payload)
    assert resp.status_code == 200
    assert resp.json() == 2

    # Verify tags appended
    img1_fetched = (await client.get(f"/api/images/{img1_id}")).json()
    assert "bulk_tag" in img1_fetched["tags"]

    # 2. Bulk Move: Move both images to Set 2
    bulk_move_payload = {
        "image_ids": [img1_id, img2_id],
        "target_set_id": set2_id
    }
    resp = await client.post("/api/images/bulk-move", json=bulk_move_payload)
    assert resp.status_code == 200
    assert resp.json() == 2

    # Verify move
    img1_fetched = (await client.get(f"/api/images/{img1_id}")).json()
    assert img1_fetched["set_id"] == set2_id

@pytest.mark.asyncio
async def test_merge_creators(client: AsyncClient):
    """
    Test merging two creators.
    """
    resp = await client.post("/api/creators/", json={"canonical_name": "Source Artist"})
    source_id = resp.json()["id"]

    resp = await client.post("/api/creators/", json={"canonical_name": "Target Artist"})
    target_id = resp.json()["id"]

    # Create a set linked to source
    await client.post("/api/sets/", json={"title": "Source Set", "creator_ids": [source_id], "local_path": "/tmp/src"})

    # Merge source into target
    resp = await client.post("/api/creators/merge", json={
        "source_ids": [source_id],
        "target_id": target_id
    })
    assert resp.status_code == 200

    # Source should be deleted
    resp = await client.get(f"/api/creators/{source_id}")
    assert resp.status_code == 404

    # Target should now have the set
    resp = await client.get(f"/api/creators/{target_id}")
    assert resp.status_code == 200
    target_creator = resp.json()
    assert any(s["title"] == "Source Set" for s in target_creator["sets"])

@pytest.mark.asyncio
async def test_duplicate_groups_empty(client: AsyncClient):
    """
    Test duplicates endpoint when there are none.
    """
    response = await client.get("/api/images/duplicates/groups")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
    # The groups logic requires identical phashes, so empty should be empty
    assert len(response.json()) == 0
