import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.crud.tag import get_or_create_tag
from app.models.character import Character
from app.models.franchise import Franchise

@pytest.mark.asyncio
async def test_get_or_create_tag_title_casing(db_session: AsyncSession):
    # Test title casing and special cases
    tag1 = await get_or_create_tag(db_session, "nature")
    assert tag1.name == "Nature"

    tag2 = await get_or_create_tag(db_session, "cny")
    assert tag2.name == "Cny"
    
    # Test retrieving existing tag
    tag3 = await get_or_create_tag(db_session, "nature")
    assert tag3.id == tag1.id

@pytest.mark.asyncio
async def test_get_or_create_tag_empty(db_session: AsyncSession):
    # Test empty string raises ValueError
    with pytest.raises(ValueError, match="Tag name cannot be empty"):
        await get_or_create_tag(db_session, "   ")

@pytest.mark.asyncio
async def test_get_or_create_tag_collisions(db_session: AsyncSession):
    # Setup collision records
    char = Character(name="Goku")
    db_session.add(char)
    fran = Franchise(name="Dragon Ball")
    db_session.add(fran)
    await db_session.commit()

    # Test collision with Character
    with pytest.raises(ValueError, match="A character with this name already exists"):
        await get_or_create_tag(db_session, "goku")

    # Test collision with Franchise
    with pytest.raises(ValueError, match="A franchise with this name already exists"):
        await get_or_create_tag(db_session, "dragon ball")

@pytest.mark.asyncio
async def test_merge_tags_api(client: AsyncClient, db_session: AsyncSession):
    # 1. Create source and target tags in the DB
    source = await get_or_create_tag(db_session, "Source Tag")
    target = await get_or_create_tag(db_session, "Target Tag")
    await db_session.commit()
    source_id = source.id
    target_id = target.id

    # 2. Create a Set with the source tag to test migration
    set_resp = await client.post("/api/sets/", json={
        "title": "Tag Merge Set Test",
        "tags": ["Source Tag"],
        "local_path": "/tmp/tag_merge_test"
    })
    assert set_resp.status_code == 200
    set_id = set_resp.json()["id"]

    # 3. Call the merge tags API
    merge_resp = await client.post("/api/tags/merge", json={
        "source_ids": [source_id],
        "target_id": target_id
    })
    assert merge_resp.status_code == 200
    merged_tag = merge_resp.json()
    assert merged_tag["id"] == target_id
    assert merged_tag["name"] == "Target Tag"

    # 4. Verify the source tag is deleted and the set is updated
    get_set_resp = await client.get(f"/api/sets/{set_id}")
    assert get_set_resp.status_code == 200
    updated_set = get_set_resp.json()
    tag_names = updated_set["tags"]
    assert "Target Tag" in tag_names
    assert "Source Tag" not in tag_names
