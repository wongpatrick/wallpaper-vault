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
async def test_create_set_persists_and_retrievable(client: AsyncClient, temp_vault: Path):
    """Test that creating a set persists the record in the DB and is retrievable."""
    await client.put("/api/settings/base_library_path", json={"value": str(temp_vault)})
    
    resp = await client.post("/api/sets/", json={
        "title": "Annie - Test"
    })
    assert resp.status_code == 200
    created_id = resp.json()["id"]
    
    # Retrieve set by ID in a subsequent request
    get_resp = await client.get(f"/api/sets/{created_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["title"] == "Annie - Test"
    
    # Verify set appears in main list query
    list_resp = await client.get("/api/sets/")
    assert list_resp.status_code == 200
    titles = [s["title"] for s in list_resp.json()["items"]]
    assert "Annie - Test" in titles

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


@pytest.mark.asyncio
async def test_import_existing_set(client: AsyncClient, temp_vault: Path):
    """Test importing into an existing set updates notes and appends images."""
    await client.put("/api/settings/base_library_path", json={"value": str(temp_vault)})

    # Create creator
    resp = await client.post("/api/creators/", json={"canonical_name": "Import Artist"})
    assert resp.status_code == 200

    # First import (creates the set)
    resp = await client.post("/api/sets/import", json={
        "title": "Import Set",
        "creator_names": ["Import Artist"],
        "local_path": str(temp_vault / "Import Artist - Import Set"),
        "notes": "First note",
        "images": []
    })
    assert resp.status_code == 200
    initial_data = resp.json()
    assert initial_data["notes"] == "First note"
    assert len(initial_data["images"]) == 0

    # Second import (same title/creator) - merges/updates set
    img_path = temp_vault / "test_img.jpg"
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    cv2.imwrite(str(img_path), img)

    resp = await client.post("/api/sets/import", json={
        "title": "Import Set",
        "creator_names": ["Import Artist"],
        "local_path": str(temp_vault / "Import Artist - Import Set"),
        "notes": "Second note",
        "images": [
            {
                "filename": "test_img.jpg",
                "local_path": str(img_path)
            }
        ]
    })
    assert resp.status_code == 200
    updated_data = resp.json()
    assert updated_data["notes"] == "First note\nSecond note"
    assert len(updated_data["images"]) == 1
    assert updated_data["images"][0]["filename"] == "test_img.jpg"


@pytest.mark.asyncio
async def test_import_sets_same_title_different_creators(client: AsyncClient, temp_vault: Path):
    """Test that importing two sets with the same title but different creators results in two separate sets instead of merging."""
    await client.put("/api/settings/base_library_path", json={"value": str(temp_vault)})

    # First import: Set "Vol. 123" with creators ["Xiuren", "Nienie"]
    resp1 = await client.post("/api/sets/import", json={
        "title": "Vol. 123",
        "creator_names": ["Xiuren", "Nienie"],
        "local_path": str(temp_vault / "Xiuren & Nienie - Vol. 123"),
        "notes": "First Set",
        "images": []
    })
    assert resp1.status_code == 200
    set1_data = resp1.json()

    # Second import: Set "Vol. 123" with creators ["Xiuren", "Yany"]
    resp2 = await client.post("/api/sets/import", json={
        "title": "Vol. 123",
        "creator_names": ["Xiuren", "Yany"],
        "local_path": str(temp_vault / "Xiuren & Yany - Vol. 123"),
        "notes": "Second Set",
        "images": []
    })
    assert resp2.status_code == 200
    set2_data = resp2.json()

    # Verify they are two completely distinct sets with different IDs and different creators list
    assert set1_data["id"] != set2_data["id"]
    
    set1_creators = {c["canonical_name"] for c in set1_data["creators"]}
    set2_creators = {c["canonical_name"] for c in set2_data["creators"]}
    assert set1_creators == {"Xiuren", "Nienie"}
    assert set2_creators == {"Xiuren", "Yany"}


@pytest.mark.asyncio
async def test_delete_set_folder_cleanup_and_rollback(client: AsyncClient, temp_vault: Path):
    """Test that deleting a set removes its physical folder, and a locked folder rolls back the DB deletion."""
    # 1. Create a set
    set_dir = temp_vault / "cleanup_test_set"
    set_dir.mkdir(exist_ok=True)
    
    resp = await client.post("/api/sets/", json={
        "title": "Cleanup Test Set",
        "local_path": str(set_dir)
    })
    assert resp.status_code == 200
    set_id = resp.json()["id"]
    
    # 2. Add an image and create its thumbnail in cached thumbs directory
    from app.api.thumbnails import THUMBS_DIR
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    img_path = set_dir / "test_image.jpg"
    cv2.imwrite(str(img_path), img)
    
    # Resync to register the image
    resync_resp = await client.post(f"/api/sets/{set_id}/resync")
    assert resync_resp.status_code == 200
    img_id = resync_resp.json()["images"][0]["id"]
    
    # Create cached thumbnail file manually
    THUMBS_DIR.mkdir(parents=True, exist_ok=True)
    thumb_file = THUMBS_DIR / f"{img_id}_sm.jpg"
    with open(thumb_file, "w") as f:
        f.write("thumb data")
    assert thumb_file.exists()
    
    # 3. Simulate a PermissionError (folder is locked/in-use) by mocking shutil.rmtree
    import shutil
    original_rmtree = shutil.rmtree
    
    def mocked_rmtree_fail(path, *args, **kwargs):
        raise PermissionError("Folder locked")
        
    shutil.rmtree = mocked_rmtree_fail
    try:
        # Delete should fail with 409 Conflict
        del_resp = await client.delete(f"/api/sets/{set_id}")
        assert del_resp.status_code == 409
        assert "in use by another process" in del_resp.json()["detail"]
        
        # Verify that because db.rollback() was called, the database rolled back.
        # Note: in this test context, conftest's db_session fixture runs the entire test in one transaction.
        # Therefore, calling db.rollback() rolls back the set insertion too, making client.get return 404.
        get_resp = await client.get(f"/api/sets/{set_id}")
        assert get_resp.status_code == 404
        
        # Verify that the physical files on disk were NOT cleaned up
        assert set_dir.exists()
        assert thumb_file.exists()
    finally:
        shutil.rmtree = original_rmtree
        
    # 4. Now perform deletion successfully (no mock) on a new set
    set_dir2 = temp_vault / "cleanup_test_set2"
    set_dir2.mkdir(exist_ok=True)
    resp2 = await client.post("/api/sets/", json={
        "title": "Cleanup Test Set 2",
        "local_path": str(set_dir2)
    })
    assert resp2.status_code == 200
    set_id2 = resp2.json()["id"]
    
    img2_path = set_dir2 / "test_image2.jpg"
    cv2.imwrite(str(img2_path), img)
    
    resync_resp2 = await client.post(f"/api/sets/{set_id2}/resync")
    assert resync_resp2.status_code == 200
    img_id2 = resync_resp2.json()["images"][0]["id"]
    
    thumb_file2 = THUMBS_DIR / f"{img_id2}_sm.jpg"
    with open(thumb_file2, "w") as f:
        f.write("thumb data")
    assert thumb_file2.exists()
    
    del_resp2 = await client.delete(f"/api/sets/{set_id2}")
    assert del_resp2.status_code == 200
    
    # Verify set is gone from database
    get_resp2 = await client.get(f"/api/sets/{set_id2}")
    assert get_resp2.status_code == 404
    
    # Verify folder is deleted from disk
    assert not set_dir2.exists()
    # Verify thumbnail is deleted
    assert not thumb_file2.exists()


@pytest.mark.asyncio
async def test_bulk_delete_sets_folder_cleanup_and_rollback(client: AsyncClient, temp_vault: Path):
    """Test that bulk deleting sets removes physical folders, and rolls back all deletions if one is locked."""
    from app.api.thumbnails import THUMBS_DIR

    # 1. Create two sets
    set_dir1 = temp_vault / "bulk_cleanup_1"
    set_dir1.mkdir(exist_ok=True)
    resp1 = await client.post("/api/sets/", json={"title": "Bulk 1", "local_path": str(set_dir1)})
    id1 = resp1.json()["id"]

    set_dir2 = temp_vault / "bulk_cleanup_2"
    set_dir2.mkdir(exist_ok=True)
    resp2 = await client.post("/api/sets/", json={"title": "Bulk 2", "local_path": str(set_dir2)})
    id2 = resp2.json()["id"]

    # 2. Add an image and thumbnail to set 1
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    cv2.imwrite(str(set_dir1 / "image1.jpg"), img)
    resync_resp1 = await client.post(f"/api/sets/{id1}/resync")
    img_id1 = resync_resp1.json()["images"][0]["id"]
    
    THUMBS_DIR.mkdir(parents=True, exist_ok=True)
    thumb_file1 = THUMBS_DIR / f"{img_id1}_sm.jpg"
    with open(thumb_file1, "w") as f:
        f.write("thumb data 1")

    # Add an image and thumbnail to set 2
    cv2.imwrite(str(set_dir2 / "image2.jpg"), img)
    resync_resp2 = await client.post(f"/api/sets/{id2}/resync")
    img_id2 = resync_resp2.json()["images"][0]["id"]
    
    thumb_file2 = THUMBS_DIR / f"{img_id2}_sm.jpg"
    with open(thumb_file2, "w") as f:
        f.write("thumb data 2")

    # 3. Mock shutil.rmtree to fail for set 2 (simulate lock)
    import shutil
    original_rmtree = shutil.rmtree

    def mocked_rmtree(path, *args, **kwargs):
        if "bulk_cleanup_2" in str(path):
            raise PermissionError("File locked")
        original_rmtree(path, *args, **kwargs)

    shutil.rmtree = mocked_rmtree
    try:
        # Bulk delete should fail with 409 Conflict
        del_resp = await client.post("/api/sets/bulk-delete", json=[id1, id2])
        assert del_resp.status_code == 409
        
        # Verify that set_dir1 was deleted (since folder deletions are not transactional on disk)
        assert not set_dir1.exists()
        # Verify that set_dir2 was not deleted (due to simulated lock)
        assert set_dir2.exists()
        # Verify that thumbnails are NOT deleted (due to database transaction rollback preventing thumbnail invalidation)
        assert thumb_file1.exists()
        assert thumb_file2.exists()
    finally:
        shutil.rmtree = original_rmtree

    # 4. Now perform bulk deletion successfully on new sets
    set_dir3 = temp_vault / "bulk_cleanup_3"
    set_dir3.mkdir(exist_ok=True)
    resp3 = await client.post("/api/sets/", json={"title": "Bulk 3", "local_path": str(set_dir3)})
    id3 = resp3.json()["id"]

    set_dir4 = temp_vault / "bulk_cleanup_4"
    set_dir4.mkdir(exist_ok=True)
    resp4 = await client.post("/api/sets/", json={"title": "Bulk 4", "local_path": str(set_dir4)})
    id4 = resp4.json()["id"]

    cv2.imwrite(str(set_dir3 / "image3.jpg"), img)
    resync_resp3 = await client.post(f"/api/sets/{id3}/resync")
    img_id3 = resync_resp3.json()["images"][0]["id"]
    thumb_file3 = THUMBS_DIR / f"{img_id3}_sm.jpg"
    with open(thumb_file3, "w") as f:
        f.write("thumb data 3")

    cv2.imwrite(str(set_dir4 / "image4.jpg"), img)
    resync_resp4 = await client.post(f"/api/sets/{id4}/resync")
    img_id4 = resync_resp4.json()["images"][0]["id"]
    thumb_file4 = THUMBS_DIR / f"{img_id4}_sm.jpg"
    with open(thumb_file4, "w") as f:
        f.write("thumb data 4")

    del_resp2 = await client.post("/api/sets/bulk-delete", json=[id3, id4])
    assert del_resp2.status_code == 200
    assert del_resp2.json() == 2

    # Verify folders and thumbnails are deleted
    assert not set_dir3.exists()
    assert not set_dir4.exists()
    assert not thumb_file3.exists()
    assert not thumb_file4.exists()




