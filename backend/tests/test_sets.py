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
