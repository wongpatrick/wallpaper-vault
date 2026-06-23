import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
import tempfile
from pathlib import Path
import cv2
import numpy as np


@pytest.fixture
def temp_vault():
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.mark.asyncio
async def test_audit_create_and_import(
    client: AsyncClient, temp_vault: Path, db_session: AsyncSession
):
    """Test the 'create_and_import' resolution for orphaned folders."""
    await client.put("/api/settings/base_library_path", json={"value": str(temp_vault)})

    # 1. Create a physical folder inside the vault that the DB doesn't know about
    orphan_folder = temp_vault / "Orphan Creator - Orphan Set"
    orphan_folder.mkdir()

    img = np.zeros((100, 100, 3), dtype=np.uint8)
    img_path = orphan_folder / "orphan_img.jpg"
    cv2.imwrite(str(img_path), img)

    # 2. Run Audit synchronously
    from app.services import audit_service

    class MockSessionLocal:
        async def __aenter__(self):
            return db_session

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    audit_service.SessionLocal = MockSessionLocal

    resp = await client.post("/api/audit/start", json={"quick_scan": True})
    assert resp.status_code == 200

    import asyncio

    await asyncio.sleep(0.5)

    # 3. Fetch audit results
    resp = await client.get("/api/audit/results")
    assert resp.status_code == 200
    results = resp.json()

    # Should detect 1 orphan
    assert results["total"] >= 1
    orphan_issue = next(
        (
            issue
            for issue in results["items"]
            if issue["issue_type"] == "orphan"
            and issue["path"].endswith("orphan_img.jpg")
        ),
        None,
    )
    assert orphan_issue is not None

    issue_id = orphan_issue["id"]

    # 4. Resolve via create_and_import
    resp = await client.post(
        "/api/audit/resolve",
        json={"issue_ids": [issue_id], "action": "create_and_import"},
    )
    assert resp.status_code == 200
    assert resp.json()["resolved_count"] == 1

    # 5. Verify the Set and Creator were created
    resp = await client.get("/api/sets/")
    sets = resp.json()["items"]
    imported_set = next((s for s in sets if s["title"] == "Orphan Set"), None)

    assert imported_set is not None
    assert "Orphan Creator" in imported_set["creators"][0]["canonical_name"]
    assert len(imported_set["images"]) == 1
    assert imported_set["images"][0]["filename"] == "orphan_img.jpg"


@pytest.mark.asyncio
async def test_audit_ignore(
    client: AsyncClient, temp_vault: Path, db_session: AsyncSession
):
    """Test ignoring an audit issue."""
    await client.put("/api/settings/base_library_path", json={"value": str(temp_vault)})

    # Create an orphan
    orphan_folder = temp_vault / "Ignore Me"
    orphan_folder.mkdir()
    img_path = orphan_folder / "ignore.jpg"
    cv2.imwrite(str(img_path), np.zeros((10, 10, 3), dtype=np.uint8))

    from app.services import audit_service

    class MockSessionLocal:
        async def __aenter__(self):
            return db_session

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    audit_service.SessionLocal = MockSessionLocal

    await client.post("/api/audit/start", json={"quick_scan": True})

    import asyncio

    await asyncio.sleep(0.5)

    resp = await client.get("/api/audit/results")
    results = resp.json()
    issue_id = results["items"][0]["id"]

    resp = await client.post(
        "/api/audit/resolve", json={"issue_ids": [issue_id], "action": "ignore"}
    )
    assert resp.status_code == 200
    assert resp.json()["resolved_count"] == 1

    # The issue should now be filtered out of the 'pending' view
    resp = await client.get("/api/audit/results")
    assert len(resp.json()["items"]) == 0


@pytest.mark.asyncio
async def test_audit_empty_and_ghost_sets(
    client: AsyncClient, temp_vault: Path, db_session: AsyncSession
):
    """Test detection and resolution of empty sets and ghost sets."""
    await client.put("/api/settings/base_library_path", json={"value": str(temp_vault)})

    # 1. Create a ghost set (no folder on disk) and an empty set (has folder on disk, but 0 images)
    from app.models.set import Set

    ghost_set = Set(
        title="Ghost Set", local_path=str(temp_vault / "Nonexistent Folder")
    )
    empty_set_dir = temp_vault / "Empty Set Folder"
    empty_set_dir.mkdir()
    empty_set = Set(title="Empty Set", local_path=str(empty_set_dir))

    db_session.add(ghost_set)
    db_session.add(empty_set)
    await db_session.commit()

    from app.services import audit_service

    class MockSessionLocal:
        async def __aenter__(self):
            return db_session

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    audit_service.SessionLocal = MockSessionLocal

    await client.post("/api/audit/start", json={"quick_scan": True})
    import asyncio

    await asyncio.sleep(0.5)

    resp = await client.get("/api/audit/results")
    results = resp.json()

    # Check that both ghost_set and empty_set issues are detected
    issues = results["items"]
    ghost_issue = next((i for i in issues if i["issue_type"] == "ghost_set"), None)
    empty_issue = next((i for i in issues if i["issue_type"] == "empty_set"), None)
    assert ghost_issue is not None
    assert empty_issue is not None

    # 2. Resolve them by purging
    resp = await client.post(
        "/api/audit/resolve",
        json={"issue_ids": [ghost_issue["id"], empty_issue["id"]], "action": "purge"},
    )
    assert resp.status_code == 200
    assert resp.json()["resolved_count"] == 2

    # Verify the sets are deleted from database
    from sqlalchemy import select

    res = await db_session.execute(
        select(Set).filter(Set.id.in_([ghost_set.id, empty_set.id]))
    )
    assert len(res.scalars().all()) == 0


@pytest.mark.asyncio
async def test_audit_corrupted_images(
    client: AsyncClient, temp_vault: Path, db_session: AsyncSession
):
    """Test detection and resolution of corrupted images."""
    await client.put("/api/settings/base_library_path", json={"value": str(temp_vault)})

    # 1. Create a set and a corrupted image file on disk (corrupted files return None when loaded)
    from app.models.set import Set
    from app.models.image import Image

    set_dir = temp_vault / "Corrupted Set"
    set_dir.mkdir()
    db_set = Set(title="Corrupted Set", local_path=str(set_dir))
    db_session.add(db_set)
    await db_session.commit()

    # Write some corrupted text to the file instead of a valid image
    corrupt_file = set_dir / "corrupt.jpg"
    with open(corrupt_file, "w") as f:
        f.write("Definitely not an image")

    db_image = Image(
        set_id=db_set.id, filename="corrupt.jpg", local_path=str(corrupt_file)
    )
    db_session.add(db_image)
    await db_session.commit()

    from app.services import audit_service

    class MockSessionLocal:
        async def __aenter__(self):
            return db_session

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    audit_service.SessionLocal = MockSessionLocal

    await client.post("/api/audit/start", json={"quick_scan": True})
    import asyncio

    await asyncio.sleep(0.5)

    resp = await client.get("/api/audit/results")
    results = resp.json()

    # Should detect corrupted image
    corrupted_issue = next(
        (i for i in results["items"] if i["issue_type"] == "corrupted_image"), None
    )
    assert corrupted_issue is not None

    # 2. Resolve via delete_file (which deletes the file and purges the DB record)
    resp = await client.post(
        "/api/audit/resolve",
        json={"issue_ids": [corrupted_issue["id"]], "action": "delete_file"},
    )
    assert resp.status_code == 200
    assert resp.json()["resolved_count"] == 1
    assert not corrupt_file.exists()

    # Verify image record is deleted
    res = await db_session.get(Image, db_image.id)
    assert res is None


@pytest.mark.asyncio
async def test_audit_path_mismatch(
    client: AsyncClient, temp_vault: Path, db_session: AsyncSession
):
    """Test detection and resolution of path mismatches."""
    await client.put("/api/settings/base_library_path", json={"value": str(temp_vault)})

    # 1. Create two sets, and put an image physically in Set B's directory, but assign it to Set A in DB
    from app.models.set import Set
    from app.models.image import Image

    dir_a = temp_vault / "Set A"
    dir_a.mkdir()
    dir_b = temp_vault / "Set B"
    dir_b.mkdir()

    set_a = Set(title="Set A", local_path=str(dir_a))
    set_b = Set(title="Set B", local_path=str(dir_b))
    db_session.add(set_a)
    db_session.add(set_b)
    await db_session.commit()

    # Put file physically in Set B
    img_path = dir_b / "mismatched.jpg"
    cv2.imwrite(str(img_path), np.zeros((10, 10, 3), dtype=np.uint8))

    # But assign it to set_a.id in DB
    db_image = Image(
        set_id=set_a.id, filename="mismatched.jpg", local_path=str(img_path)
    )
    db_session.add(db_image)
    await db_session.commit()

    from app.services import audit_service

    class MockSessionLocal:
        async def __aenter__(self):
            return db_session

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    audit_service.SessionLocal = MockSessionLocal

    await client.post("/api/audit/start", json={"quick_scan": True})
    import asyncio

    await asyncio.sleep(0.5)

    resp = await client.get("/api/audit/results")
    results = resp.json()

    # Should detect path mismatch
    mismatch_issue = next(
        (i for i in results["items"] if i["issue_type"] == "path_mismatch"), None
    )
    assert mismatch_issue is not None

    # 2. Resolve via repair (updates DB set_id to match the folder where it physically resides)
    resp = await client.post(
        "/api/audit/resolve",
        json={"issue_ids": [mismatch_issue["id"]], "action": "repair"},
    )
    assert resp.status_code == 200
    assert resp.json()["resolved_count"] == 1

    # Verify the image set_id is updated to Set B
    await db_session.refresh(db_image)
    assert db_image.set_id == set_b.id


@pytest.mark.asyncio
async def test_audit_database_orphans(
    client: AsyncClient, temp_vault: Path, db_session: AsyncSession
):
    """Test detection and resolution of database orphans (unused tags, creators, characters)."""
    await client.put("/api/settings/base_library_path", json={"value": str(temp_vault)})

    # 1. Create unused Tag, Creator, and Character records
    from app.models.tag import Tag
    from app.models.creator import Creator
    from app.models.character import Character

    orphan_tag = Tag(name="Orphan Tag")
    orphan_creator = Creator(canonical_name="Orphan Creator")
    orphan_character = Character(name="Orphan Character")

    db_session.add(orphan_tag)
    db_session.add(orphan_creator)
    db_session.add(orphan_character)
    await db_session.commit()

    from app.services import audit_service

    class MockSessionLocal:
        async def __aenter__(self):
            return db_session

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    audit_service.SessionLocal = MockSessionLocal

    await client.post("/api/audit/start", json={"quick_scan": True})
    import asyncio

    await asyncio.sleep(0.5)

    resp = await client.get("/api/audit/results")
    results = resp.json()

    # Check that tag, creator, and character orphans are detected
    issues = results["items"]
    tag_issue = next((i for i in issues if i["issue_type"] == "orphan_tag"), None)
    creator_issue = next(
        (i for i in issues if i["issue_type"] == "orphan_creator"), None
    )
    char_issue = next(
        (i for i in issues if i["issue_type"] == "orphan_character"), None
    )

    assert tag_issue is not None
    assert creator_issue is not None
    assert char_issue is not None

    # 2. Resolve them by purging
    resp = await client.post(
        "/api/audit/resolve",
        json={
            "issue_ids": [tag_issue["id"], creator_issue["id"], char_issue["id"]],
            "action": "purge",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["resolved_count"] == 3

    # Verify they are deleted from DB
    assert (await db_session.get(Tag, orphan_tag.id)) is None
    assert (await db_session.get(Creator, orphan_creator.id)) is None
    assert (await db_session.get(Character, orphan_character.id)) is None
