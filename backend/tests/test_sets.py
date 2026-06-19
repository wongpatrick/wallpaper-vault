import pytest
from httpx import AsyncClient
import tempfile
from pathlib import Path
import cv2
import numpy as np

@pytest.fixture
def temp_vault():
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)

@pytest.mark.asyncio
async def test_set_auto_generate_folder(client: AsyncClient, temp_vault: Path):
    """Test that creating a set without a local_path auto-generates one inside the vault."""
    # Set the base library path
    await client.put("/api/settings/base_library_path", json={"value": str(temp_vault)})
    
    # Create a creator
    resp = await client.post("/api/creators/", json={"canonical_name": "Auto Artist"})
    creator_id = resp.json()["id"]
    
    # Create a set without local_path
    resp = await client.post("/api/sets/", json={
        "title": "Auto Set",
        "creator_ids": [creator_id]
        # Notice no local_path
    })
    
    assert resp.status_code == 200
    data = resp.json()
    assert data["local_path"] is not None
    
    expected_path = temp_vault / "Auto Artist - Auto Set"
    assert data["local_path"] == str(expected_path)
    assert expected_path.exists()

@pytest.mark.asyncio
async def test_set_auto_rename_folder(client: AsyncClient, temp_vault: Path):
    """Test that updating a set's title renames its physical folder."""
    await client.put("/api/settings/base_library_path", json={"value": str(temp_vault)})
    
    resp = await client.post("/api/creators/", json={"canonical_name": "Rename Artist"})
    creator_id = resp.json()["id"]
    
    resp = await client.post("/api/sets/", json={
        "title": "Old Name",
        "creator_ids": [creator_id]
    })
    set_id = resp.json()["id"]
    old_path = Path(resp.json()["local_path"])
    assert old_path.name == "Rename Artist - Old Name"
    assert old_path.exists()
    
    # Update title
    resp = await client.patch(f"/api/sets/{set_id}", json={
        "title": "New Name"
    })
    assert resp.status_code == 200
    
    new_path = Path(resp.json()["local_path"])
    assert new_path.name == "Rename Artist - New Name"
    assert new_path.exists()
    assert not old_path.exists()

@pytest.mark.asyncio
async def test_set_resync(client: AsyncClient, temp_vault: Path):
    """Test that resyncing a set detects physically added files."""
    await client.put("/api/settings/base_library_path", json={"value": str(temp_vault)})
    
    resp = await client.post("/api/creators/", json={"canonical_name": "Resync Artist"})
    creator_id = resp.json()["id"]
    
    resp = await client.post("/api/sets/", json={
        "title": "Resync Set",
        "creator_ids": [creator_id]
    })
    set_id = resp.json()["id"]
    set_path = Path(resp.json()["local_path"])
    
    # Synthesize an image directly into the physical folder
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    img_path = set_path / "surprise.jpg"
    cv2.imwrite(str(img_path), img)
    
    # Trigger Resync
    resp = await client.post(f"/api/sets/{set_id}/resync")
    assert resp.status_code == 200
    data = resp.json()
    
    # The set should now have 1 image
    assert len(data["images"]) == 1
    assert data["images"][0]["filename"] == "surprise.jpg"

@pytest.mark.asyncio
async def test_bulk_delete_sets(client: AsyncClient, temp_vault: Path):
    """Test deleting multiple sets at once."""
    resp1 = await client.post("/api/sets/", json={"title": "Delete 1", "local_path": str(temp_vault / "1")})
    resp2 = await client.post("/api/sets/", json={"title": "Delete 2", "local_path": str(temp_vault / "2")})
    
    id1 = resp1.json()["id"]
    id2 = resp2.json()["id"]
    
    resp = await client.post("/api/sets/bulk-delete", json=[id1, id2])
    assert resp.status_code == 200
    assert resp.json() == 2
    
    # Verify deletion
    assert (await client.get(f"/api/sets/{id1}")).status_code == 404
    assert (await client.get(f"/api/sets/{id2}")).status_code == 404


@pytest.mark.asyncio
async def test_set_resync_thumbnail_regeneration(client: AsyncClient, temp_vault: Path):
    """Test that resyncing a set deletes cached thumbnails if the original image has a newer mtime."""
    import os
    import time
    from app.api.thumbnails import THUMBS_DIR

    # Set the base library path
    await client.put("/api/settings/base_library_path", json={"value": str(temp_vault)})

    # 1. Create creator and set
    resp = await client.post("/api/creators/", json={"canonical_name": "Thumb Artist"})
    creator_id = resp.json()["id"]
    
    resp = await client.post("/api/sets/", json={
        "title": "Thumb Set",
        "creator_ids": [creator_id]
    })
    set_id = resp.json()["id"]
    set_path = Path(resp.json()["local_path"])
    
    # 2. Add an image
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    img_path = set_path / "thumb_test.jpg"
    cv2.imwrite(str(img_path), img)
    
    # Resync to register the image
    resp = await client.post(f"/api/sets/{set_id}/resync")
    data = resp.json()
    img_id = data["images"][0]["id"]
    
    # 3. Request thumbnail to generate it
    thumb_resp = await client.get(f"/api/images/thumb/{img_id}?size=sm")
    assert thumb_resp.status_code == 200
    
    # Verify thumbnail cached file exists
    thumb_file = THUMBS_DIR / f"{img_id}_sm.jpg"
    assert thumb_file.exists()
    
    # Set the thumbnail file's mtime to be in the past
    past_time = time.time() - 3600
    os.utime(str(thumb_file), (past_time, past_time))
    
    # Touch/update the original image file to have a newer mtime (current time)
    current_time = time.time()
    os.utime(str(img_path), (current_time, current_time))
    
    # 4. Trigger resync
    resync_resp = await client.post(f"/api/sets/{set_id}/resync")
    assert resync_resp.status_code == 200
    
    # 5. Verify the stale thumbnail file was deleted
    assert not thumb_file.exists()


@pytest.mark.asyncio
async def test_merge_sets_with_associations(client: AsyncClient, temp_vault: Path):
    """Test merging sets that have characters, creators, tags, and images."""
    await client.put("/api/settings/base_library_path", json={"value": str(temp_vault)})

    # 1. Create a Creator
    resp = await client.post("/api/creators/", json={"canonical_name": "Merge Artist"})
    creator_id = resp.json()["id"]

    # 2. Create a Character
    resp = await client.post("/api/characters/", json={"name": "Merge Character"})
    assert resp.status_code == 200

    # 3. Create Target Set (with some tags, character, and creator)
    resp = await client.post("/api/sets/", json={
        "title": "Target Set",
        "creator_ids": [creator_id],
        "tags": ["TargetTag"],
        "characters": ["Merge Character"]
    })
    assert resp.status_code == 200
    target_id = resp.json()["id"]
    target_path = Path(resp.json()["local_path"])

    # 4. Create Source Set
    resp = await client.post("/api/sets/", json={
        "title": "Source Set",
        "creator_ids": [creator_id],
        "tags": ["SourceTag"],
        "characters": ["Merge Character"]
    })
    assert resp.status_code == 200
    source_id = resp.json()["id"]
    source_path = Path(resp.json()["local_path"])

    # Synthesize an image directly into the source physical folder
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    img_path = source_path / "source_img.jpg"
    cv2.imwrite(str(img_path), img)

    # Register the image via resync
    resync_resp = await client.post(f"/api/sets/{source_id}/resync")
    assert resync_resp.status_code == 200

    # 5. Merge source into target
    merge_resp = await client.post("/api/sets/merge", json={
        "source_ids": [source_id],
        "target_id": target_id
    })
    assert merge_resp.status_code == 200

    # 6. Verify source set is deleted from DB
    get_source_resp = await client.get(f"/api/sets/{source_id}")
    assert get_source_resp.status_code == 404

    # 7. Verify target set now has the merged image
    get_target_resp = await client.get(f"/api/sets/{target_id}")
    assert get_target_resp.status_code == 200
    target_data = get_target_resp.json()

    assert len(target_data["images"]) == 1
    assert target_data["images"][0]["filename"] == "source_img.jpg"
    # File should have physically moved
    assert not img_path.exists()
    assert (target_path / "source_img.jpg").exists()


