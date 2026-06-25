import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.crud.character import get_or_create_character, create_character, get_character
from app.crud.franchise import create_franchise, get_franchise
from app.schemas.character import CharacterCreate
from app.schemas.franchise import FranchiseCreate
from app.crud.tag import get_or_create_tag, get_tag
from app.models.set import Set
from sqlalchemy.orm import selectinload
from sqlalchemy import select

@pytest.mark.asyncio
async def test_franchise_crud(db_session: AsyncSession):
    f_in = FranchiseCreate(name="Star Wars")
    f = await create_franchise(db_session, f_in)
    assert f.id is not None
    assert f.name == "Star Wars"

    f_get = await get_franchise(db_session, f.id)
    assert f_get.id == f.id
    assert f_get.name == "Star Wars"

@pytest.mark.asyncio
async def test_character_crud(db_session: AsyncSession):
    f_in = FranchiseCreate(name="Marvel")
    f = await create_franchise(db_session, f_in)
    
    c_in = CharacterCreate(name="Iron Man", franchise_id=f.id)
    c = await create_character(db_session, c_in)
    
    assert c.id is not None
    assert c.name == "Iron Man"
    assert c.franchise_id == f.id

    c_get = await get_character(db_session, c.id)
    assert c_get.id == c.id
    assert c_get.name == "Iron Man"
    assert c_get.franchise is not None
    assert c_get.franchise.name == "Marvel"

@pytest.mark.asyncio
async def test_get_or_create_character(db_session: AsyncSession):
    c1 = await get_or_create_character(db_session, "batman")
    await db_session.commit()
    assert c1.name == "Batman"

    c2 = await get_or_create_character(db_session, "batman")
    assert c1.id == c2.id

@pytest.mark.asyncio
async def test_auto_migrate_tag_to_character(db_session: AsyncSession):
    # 1. Create a tag
    tag = await get_or_create_tag(db_session, "Auto Migrate Test")
    
    # 2. Create a Set with this tag
    s = Set()
    s.tags.append(tag)
    db_session.add(s)
    await db_session.commit()
    await db_session.refresh(s)
    
    set_id = s.id
    
    # 3. Create a Character with the exact same name
    c_in = CharacterCreate(name="Auto Migrate Test")
    c = await create_character(db_session, c_in)
    
    # 4. Verify the tag is deleted
    deleted_tag = await get_tag(db_session, tag.id)
    assert deleted_tag is None
    
    # 5. Verify the Set now has the character, and no longer has the tag
    s_updated = (await db_session.execute(
        select(Set)
        .options(selectinload(Set.tags), selectinload(Set.characters))
        .where(Set.id == set_id)
    )).scalars().first()
    
    assert len(s_updated.tags) == 0
    assert c in s_updated.characters
    assert len(s_updated.characters) == 1

@pytest.mark.asyncio
async def test_franchise_parentheses_parsing(db_session: AsyncSession):
    # 1. Create character "Reze" with no franchise
    c1 = await get_or_create_character(db_session, "Reze")
    await db_session.commit()
    assert c1.name == "Reze"
    assert c1.franchise_id is None

    # 2. Call get_or_create_character with "Reze (Chainsaw Man)"
    c2 = await get_or_create_character(db_session, "Reze (Chainsaw Man)")
    await db_session.commit()
    
    # 3. Verify it returned the existing character "Reze" (same ID)
    assert c1.id == c2.id
    assert c2.name == "Reze"
    
    # 4. Verify the franchise "Chainsaw Man" was created and associated
    assert c2.franchise is not None
    assert c2.franchise.name == "Chainsaw Man"

    # 5. Call get_or_create_character for a brand new character with franchise
    c3 = await get_or_create_character(db_session, "Makima (Chainsaw Man)")
    await db_session.commit()
    
    assert c3.name == "Makima"
    assert c3.franchise is not None
    assert c3.franchise.name == "Chainsaw Man"
    assert c3.franchise_id == c2.franchise_id

@pytest.mark.asyncio
async def test_merge_characters_api(client: AsyncClient):
    # 1. Create a Franchise
    resp = await client.post("/api/franchises/", json={"name": "Chainsaw Man"})
    assert resp.status_code == 200
    franchise_id = resp.json()["id"]

    # 2. Create target character with the franchise
    resp = await client.post("/api/characters/", json={"name": "Reze", "franchise_id": franchise_id})
    assert resp.status_code == 200
    target_char = resp.json()
    assert target_char["name"] == "Reze"
    assert target_char["franchise"]["name"] == "Chainsaw Man"
    target_id = target_char["id"]

    # 3. Create source character with the franchise
    resp = await client.post("/api/characters/", json={"name": "Reze (Chainsaw Man)", "franchise_id": franchise_id})
    assert resp.status_code == 200
    source_id = resp.json()["id"]

    # 4. Merge source into target
    resp = await client.post("/api/characters/merge", json={
        "source_ids": [source_id],
        "target_id": target_id
    })
    # This would raise ResponseValidationError / MissingGreenlet previously (500)
    assert resp.status_code == 200
    merged_char = resp.json()
    assert merged_char["id"] == target_id
    assert merged_char["name"] == "Reze"
    assert merged_char["franchise"]["name"] == "Chainsaw Man"

@pytest.mark.asyncio
async def test_merge_characters_multiple_sets(db_session: AsyncSession):
    # 1. Create target character
    c_target = await get_or_create_character(db_session, "Target Character")
    # 2. Create source character
    c_source = await get_or_create_character(db_session, "Source Character")
    await db_session.commit()
    
    # 3. Create two sets associated with source character
    s1 = Set(title="Set 1")
    s1.characters.append(c_source)
    s2 = Set(title="Set 2")
    s2.characters.append(c_source)
    db_session.add_all([s1, s2])
    await db_session.commit()
    await db_session.refresh(s1)
    await db_session.refresh(s2)
    
    # 4. Merge source into target
    from app.crud.character import merge_characters
    await merge_characters(db_session, [c_source.id], c_target.id)
    
    # 5. Verify both sets now have target character and no longer have source
    s1_updated = (await db_session.execute(
        select(Set).options(selectinload(Set.characters)).where(Set.id == s1.id)
    )).scalars().first()
    s2_updated = (await db_session.execute(
        select(Set).options(selectinload(Set.characters)).where(Set.id == s2.id)
    )).scalars().first()
    
    assert c_target in s1_updated.characters
    assert c_source not in s1_updated.characters
    assert c_target in s2_updated.characters
    assert c_source not in s2_updated.characters

@pytest.mark.asyncio
async def test_merge_franchises_crud(db_session: AsyncSession):
    # 1. Create target franchise
    f_target_in = FranchiseCreate(name="Marvel")
    f_target = await create_franchise(db_session, f_target_in)
    
    # 2. Create source franchise
    f_source_in = FranchiseCreate(name="MCU")
    f_source = await create_franchise(db_session, f_source_in)
    await db_session.commit()

    # 3. Create a character in source franchise
    c_in = CharacterCreate(name="Iron Man", franchise_id=f_source.id)
    c = await create_character(db_session, c_in)
    await db_session.commit()

    # 4. Merge MCU (source) into Marvel (target)
    from app.crud.franchise import merge_franchises
    await merge_franchises(db_session, [f_source.id], f_target.id)

    # 5. Verify MCU is deleted
    f_source_deleted = await get_franchise(db_session, f_source.id)
    assert f_source_deleted is None

    # 6. Verify Iron Man is now in Marvel
    await db_session.refresh(c)
    assert c.franchise_id == f_target.id

@pytest.mark.asyncio
async def test_merge_franchises_api(client: AsyncClient):
    # 1. Create target franchise
    resp = await client.post("/api/franchises/", json={"name": "Marvel"})
    assert resp.status_code == 200
    target_id = resp.json()["id"]

    # 2. Create source franchise
    resp = await client.post("/api/franchises/", json={"name": "MCU"})
    assert resp.status_code == 200
    source_id = resp.json()["id"]

    # 3. Merge source into target
    resp = await client.post("/api/franchises/merge", json={
        "source_ids": [source_id],
        "target_id": target_id
    })
    # If there is a validation/ORM serialization error, this will fail
    assert resp.status_code == 200
    merged_franchise = resp.json()
    assert merged_franchise["id"] == target_id
    assert merged_franchise["name"] == "Marvel"

@pytest.mark.asyncio
async def test_merge_franchises_duplicate_characters(db_session: AsyncSession):
    # 1. Create target franchise Marvel
    f_target_in = FranchiseCreate(name="Marvel")
    f_target = await create_franchise(db_session, f_target_in)
    
    # 2. Create source franchise MCU
    f_source_in = FranchiseCreate(name="MCU")
    f_source = await create_franchise(db_session, f_source_in)
    await db_session.commit()

    # 3. Create "Iron Man" under Marvel (target)
    c_target_in = CharacterCreate(name="Iron Man", franchise_id=f_target.id)
    c_target = await create_character(db_session, c_target_in)

    # 4. Create "Iron Man" under MCU (source)
    c_source_in = CharacterCreate(name="Iron Man", franchise_id=f_source.id)
    c_source = await create_character(db_session, c_source_in)
    await db_session.commit()

    # 5. Create a set with MCU Iron Man
    s = Set(title="MCU Iron Man Set")
    s.characters.append(c_source)
    db_session.add(s)
    await db_session.commit()
    await db_session.refresh(s)
    
    set_id = s.id

    # 6. Merge MCU into Marvel
    from app.crud.franchise import merge_franchises
    await merge_franchises(db_session, [f_source.id], f_target.id)

    # 7. Check if we have duplicate Iron Man characters under Marvel
    from sqlalchemy import select
    from app.models.character import Character
    res = await db_session.execute(
        select(Character).where(Character.franchise_id == f_target.id, Character.name == "Iron Man")
    )
    chars = res.scalars().all()
    
    # Check if they got merged or if both exist
    assert len(chars) == 1, f"Expected 1 Iron Man character under Marvel, but found {len(chars)}"



