import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

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
        "update_data": {"notes": "bulk_note"},
        "operation_mode": "append"
    }
    resp = await client.post("/api/images/bulk-update", json=bulk_update_payload)
    assert resp.status_code == 200
    assert resp.json() == 2

    # Verify tags appended
    img1_fetched = (await client.get(f"/api/images/{img1_id}")).json()
    assert "bulk_note" in img1_fetched["notes"]

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

@pytest.mark.asyncio
async def test_merge_creators_multiple_sets(db_session: AsyncSession):
    from app.crud.creator import create_creator, merge_creators
    from app.schemas.creator import CreatorCreate
    from app.models.set import Set
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    # 1. Create target and source creators
    c_target = await create_creator(db_session, CreatorCreate(canonical_name="Target Creator"))
    c_source = await create_creator(db_session, CreatorCreate(canonical_name="Source Creator"))
    await db_session.commit()
    
    # 2. Create two sets associated with source creator
    s1 = Set(title="Set 1")
    s1.creators.append(c_source)
    s2 = Set(title="Set 2")
    s2.creators.append(c_source)
    db_session.add_all([s1, s2])
    await db_session.commit()
    await db_session.refresh(s1)
    await db_session.refresh(s2)
    
    # 3. Merge source into target
    await merge_creators(db_session, [c_source.id], c_target.id)
    
    # 4. Verify both sets now have target creator and no longer have source creator
    s1_updated = (await db_session.execute(
        select(Set).options(selectinload(Set.creators)).where(Set.id == s1.id)
    )).scalars().first()
    s2_updated = (await db_session.execute(
        select(Set).options(selectinload(Set.creators)).where(Set.id == s2.id)
    )).scalars().first()
    
    assert c_target in s1_updated.creators
    assert c_source not in s1_updated.creators
    assert c_target in s2_updated.creators
    assert c_source not in s2_updated.creators

@pytest.mark.asyncio
async def test_merge_creators_directory_rename(db_session: AsyncSession, tmp_path):
    from app.crud.creator import create_creator, merge_creators
    from app.schemas.creator import CreatorCreate
    from app.models.set import Set

    # 1. Create target and source creators
    c_target = await create_creator(db_session, CreatorCreate(canonical_name="Target Artist"))
    c_source = await create_creator(db_session, CreatorCreate(canonical_name="Source Artist"))
    await db_session.commit()

    # 2. Create set and physical directory
    s_dir = tmp_path / "Source Artist - Test Set"
    s_dir.mkdir()
    
    s = Set(title="Test Set", local_path=str(s_dir))
    s.creators.append(c_source)
    db_session.add(s)
    await db_session.commit()
    await db_session.refresh(s)

    # 3. Merge source into target
    await merge_creators(db_session, [c_source.id], c_target.id)

    # 4. Verify directory renamed
    new_expected_dir = tmp_path / "Target Artist - Test Set"
    assert new_expected_dir.exists()
    assert not s_dir.exists()

@pytest.mark.asyncio
async def test_merge_creators_directory_merge_conflict(db_session: AsyncSession, tmp_path):
    from app.crud.creator import create_creator, merge_creators
    from app.schemas.creator import CreatorCreate
    from app.models.set import Set
    from app.models.image import Image

    # 1. Create target and source creators
    c_target = await create_creator(db_session, CreatorCreate(canonical_name="Target Artist"))
    c_source = await create_creator(db_session, CreatorCreate(canonical_name="Source Artist"))
    await db_session.commit()

    # 2. Create physical directories
    s_dir = tmp_path / "Source Artist - Conflict Set"
    s_dir.mkdir()
    t_dir = tmp_path / "Target Artist - Conflict Set"
    t_dir.mkdir()

    # Write files
    (s_dir / "identical.jpg").write_text("abc")
    (s_dir / "different.jpg").write_text("hello")
    
    (t_dir / "identical.jpg").write_text("abc")
    (t_dir / "different.jpg").write_text("world")
    (t_dir / "target_only.jpg").write_text("only_target")

    # 3. Create set and images in DB
    s = Set(title="Conflict Set", local_path=str(s_dir))
    s.creators.append(c_source)
    
    img_identical = Image(filename="identical.jpg", local_path=str(s_dir / "identical.jpg"), width=10, height=10)
    img_different = Image(filename="different.jpg", local_path=str(s_dir / "different.jpg"), width=10, height=10)
    s.images.extend([img_identical, img_different])
    
    db_session.add(s)
    await db_session.commit()
    await db_session.refresh(s)

    # 4. Merge source into target
    await merge_creators(db_session, [c_source.id], c_target.id)

    # 5. Verify physical folders and files
    assert not s_dir.exists()
    assert t_dir.exists()
    
    # files in target directory
    assert (t_dir / "target_only.jpg").exists()
    assert (t_dir / "identical.jpg").read_text() == "abc"
    assert (t_dir / "different.jpg").read_text() == "world"
    assert (t_dir / "different_1.jpg").read_text() == "hello"

    # DB image paths updated
    await db_session.refresh(img_identical)
    await db_session.refresh(img_different)
    
    import sys
    sep = "\\" if sys.platform == "win32" else "/"
    
    assert img_identical.local_path == str(t_dir) + sep + "identical.jpg"
    assert img_identical.filename == "identical.jpg"
    
    assert img_different.local_path == str(t_dir) + sep + "different_1.jpg"
    assert img_different.filename == "different_1.jpg"

@pytest.mark.asyncio
async def test_merge_creators_directory_non_existent(db_session: AsyncSession, tmp_path):
    from app.crud.creator import create_creator, merge_creators
    from app.schemas.creator import CreatorCreate
    from app.models.set import Set
    from app.models.image import Image

    # 1. Create target and source creators
    c_target = await create_creator(db_session, CreatorCreate(canonical_name="Target Artist"))
    c_source = await create_creator(db_session, CreatorCreate(canonical_name="Source Artist"))
    await db_session.commit()

    # 2. Create set with non-existent path in DB
    fake_dir = tmp_path / "Source Artist - NonExistent Set"
    # Do NOT create fake_dir physically
    
    s = Set(title="NonExistent Set", local_path=str(fake_dir))
    s.creators.append(c_source)
    
    img = Image(filename="image.jpg", local_path=str(fake_dir / "image.jpg"), width=10, height=10)
    s.images.append(img)
    
    db_session.add(s)
    await db_session.commit()
    await db_session.refresh(s)

    # 3. Merge source into target
    await merge_creators(db_session, [c_source.id], c_target.id)

    # 4. Verify directory was created and DB records updated
    new_expected_dir = tmp_path / "Target Artist - NonExistent Set"
    assert new_expected_dir.exists()
    assert new_expected_dir.is_dir()
    
    await db_session.refresh(s)
    await db_session.refresh(img)
    
    import sys
    sep = "\\" if sys.platform == "win32" else "/"
    
    assert s.local_path == str(new_expected_dir)
    assert img.local_path == str(new_expected_dir) + sep + "image.jpg"


