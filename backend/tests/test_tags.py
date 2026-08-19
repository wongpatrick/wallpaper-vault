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

@pytest.mark.asyncio
async def test_merge_tags_multiple_sets_and_images(db_session: AsyncSession):
    from app.models.set import Set
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    # 1. Create target and source tags
    t_target = await get_or_create_tag(db_session, "Target Tag")
    t_source = await get_or_create_tag(db_session, "Source Tag")
    await db_session.commit()
    
    # 2. Create two sets associated with source tag
    s1 = Set(title="Set 1")
    s1.tags.append(t_source)
    s2 = Set(title="Set 2")
    s2.tags.append(t_source)
    db_session.add_all([s1, s2])
    await db_session.commit()
    await db_session.refresh(s1)
    await db_session.refresh(s2)
    
    # 3. Create images and associate them with source tag
    from app.models.image import Image
    img1 = Image(filename="img1.jpg", local_path="/tmp/img1.jpg", set_id=s1.id)
    img1.tags.append(t_source)
    img2 = Image(filename="img2.jpg", local_path="/tmp/img2.jpg", set_id=s2.id)
    img2.tags.append(t_source)
    db_session.add_all([img1, img2])
    await db_session.commit()
    await db_session.refresh(img1)
    await db_session.refresh(img2)
    
    # 4. Merge source into target
    from app.crud.tag import merge_tags
    await merge_tags(db_session, [t_source.id], t_target.id)
    
    # 5. Verify both sets now have target tag and no longer have source tag
    s1_updated = (await db_session.execute(
        select(Set).options(selectinload(Set.tags)).where(Set.id == s1.id)
    )).scalars().first()
    s2_updated = (await db_session.execute(
        select(Set).options(selectinload(Set.tags)).where(Set.id == s2.id)
    )).scalars().first()
    
    assert t_target in s1_updated.tags
    assert t_source not in s1_updated.tags
    assert t_target in s2_updated.tags
    assert t_source not in s2_updated.tags
    
    # 6. Verify images now have target tag and no longer have source tag
    img1_updated = (await db_session.execute(
        select(Image).options(selectinload(Image.tags)).where(Image.id == img1.id)
    )).scalars().first()
    img2_updated = (await db_session.execute(
        select(Image).options(selectinload(Image.tags)).where(Image.id == img2.id)
    )).scalars().first()
    
    assert t_target in img1_updated.tags
    assert t_source not in img1_updated.tags
    assert t_target in img2_updated.tags
    assert t_source not in img2_updated.tags


@pytest.mark.asyncio
async def test_tag_cloud_scoped(client: AsyncClient, db_session: AsyncSession):
    from app.models.set import Set
    from app.models.image import Image

    # 1. Create tags
    tag_set_only = await get_or_create_tag(db_session, "Set Only Tag")
    tag_image_only = await get_or_create_tag(db_session, "Image Only Tag")
    await db_session.commit()

    # 2. Create a set with tag_set_only
    s = Set(title="Cloud Scope Set Test", local_path="/tmp/scope_test")
    s.tags.append(tag_set_only)
    db_session.add(s)
    await db_session.commit()
    await db_session.refresh(s)

    # 3. Create an image in that set with tag_image_only
    img = Image(filename="scope_img.jpg", local_path="/tmp/scope_img.jpg", set_id=s.id)
    img.tags.append(tag_image_only)
    db_session.add(img)
    await db_session.commit()

    # 4. Query cloud with scope=sets (default)
    res_sets = await client.get("/api/tags/cloud?scope=sets")
    assert res_sets.status_code == 200
    sets_data = res_sets.json()
    sets_tags = {item["tag"]: item["count"] for item in sets_data}
    assert "Set Only Tag" in sets_tags
    assert sets_tags["Set Only Tag"] == 1
    assert "Image Only Tag" not in sets_tags

    # 5. Query cloud with scope=images
    res_images = await client.get("/api/tags/cloud?scope=images")
    assert res_images.status_code == 200
    images_data = res_images.json()
    images_tags = {item["tag"]: item["count"] for item in images_data}
    assert "Image Only Tag" in images_tags
    assert images_tags["Image Only Tag"] == 1
    assert "Set Only Tag" not in images_tags

