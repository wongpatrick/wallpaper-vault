import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.character import Character
from app.models.set import Set
from app.models.image import Image
from app.crud.tag import get_or_create_tag
from app.crud.character import get_or_create_character
from app.crud.franchise import get_or_create_franchise

@pytest.mark.asyncio
async def test_bulk_delete_characters(client: AsyncClient, db_session: AsyncSession):
    # Create franchise
    await get_or_create_franchise(db_session, "Bulk Franchise")
    # Create characters
    char1 = await get_or_create_character(db_session, "Char One (Bulk Franchise)")
    char2 = await get_or_create_character(db_session, "Char Two (Bulk Franchise)")
    await db_session.commit()
    
    char1_id = char1.id
    char2_id = char2.id
    
    # Associate them with a set
    s = Set(title="Bulk Character Set")
    s.characters.append(char1)
    s.characters.append(char2)
    db_session.add(s)
    await db_session.commit()
    
    s_id = s.id
    
    # Verify association via API first
    get_set_before = await client.get(f"/api/sets/{s_id}")
    assert len(get_set_before.json().get("characters", [])) == 2
    
    # Call bulk-delete
    resp = await client.post("/api/characters/bulk-delete", json={"ids": [char1_id, char2_id]})
    assert resp.status_code == 204
    
    # Expire all cached models in db_session
    db_session.expire_all()
    
    # Verify characters are deleted via API
    get_chars_resp = await client.get("/api/characters/")
    assert get_chars_resp.status_code == 200
    all_char_ids = [c["id"] for c in get_chars_resp.json()]
    assert char1_id not in all_char_ids
    assert char2_id not in all_char_ids
    
    # Verify set-character associations are cleared via API
    get_set_resp = await client.get(f"/api/sets/{s_id}")
    assert get_set_resp.status_code == 200
    assert len(get_set_resp.json().get("characters", [])) == 0

@pytest.mark.asyncio
async def test_bulk_delete_franchises(client: AsyncClient, db_session: AsyncSession):
    # Create franchises
    f1 = await get_or_create_franchise(db_session, "Franchise F1")
    f2 = await get_or_create_franchise(db_session, "Franchise F2")
    await db_session.commit()
    
    f1_id = f1.id
    f2_id = f2.id
    
    # Create characters under these franchises
    char1 = Character(name="Hero F1", franchise_id=f1_id)
    char2 = Character(name="Hero F2", franchise_id=f2_id)
    db_session.add_all([char1, char2])
    await db_session.commit()
    
    char1_id = char1.id
    char2_id = char2.id
    
    # Call bulk-delete
    resp = await client.post("/api/franchises/bulk-delete", json={"ids": [f1_id, f2_id]})
    assert resp.status_code == 204
    
    # Expire all cached models in db_session
    db_session.expire_all()
    
    # Verify franchises are deleted via API
    get_frans_resp = await client.get("/api/franchises/")
    assert get_frans_resp.status_code == 200
    all_fran_ids = [f["id"] for f in get_frans_resp.json()]
    assert f1_id not in all_fran_ids
    assert f2_id not in all_fran_ids
    
    # Verify characters no longer have franchises associated via API
    get_chars_resp = await client.get("/api/characters/")
    assert get_chars_resp.status_code == 200
    chars_map = {c["id"]: c for c in get_chars_resp.json()}
    assert chars_map[char1_id]["franchise_id"] is None
    assert chars_map[char2_id]["franchise_id"] is None

@pytest.mark.asyncio
async def test_bulk_delete_tags(client: AsyncClient, db_session: AsyncSession):
    # Create tags
    t1 = await get_or_create_tag(db_session, "BulkTag1")
    t2 = await get_or_create_tag(db_session, "BulkTag2")
    await db_session.commit()
    
    t1_id = t1.id
    t2_id = t2.id
    
    # Create a set and image with these tags
    s = Set(title="Bulk Tag Set", local_path="/tmp/bulk_tag_test")
    db_session.add(s)
    await db_session.commit()
    
    s_id = s.id
    
    img = Image(filename="test.jpg", local_path="/tmp/bulk_tag_test/test.jpg", set_id=s_id)
    img.tags.append(t1)
    img.tags.append(t2)
    db_session.add(img)
    await db_session.commit()
    
    # Ensure set rollup tags gets recalculated or populated
    from app.crud.set import recalculate_set_rollup_tags
    await recalculate_set_rollup_tags(db_session, s_id)
    
    # Verify rollup tag association (Title casing yields Bulktag1)
    get_set_before = await client.get(f"/api/sets/{s_id}")
    assert "Bulktag1" in get_set_before.json().get("tags", [])
    
    # Call bulk-delete
    resp = await client.post("/api/tags/bulk-delete", json={"ids": [t1_id, t2_id]})
    assert resp.status_code == 204
    
    # Expire all cached models in db_session
    db_session.expire_all()
    
    # Verify tags are deleted via API
    get_tags_resp = await client.get("/api/tags/management")
    assert get_tags_resp.status_code == 200
    all_tag_ids = [t["id"] for t in get_tags_resp.json()]
    assert t1_id not in all_tag_ids
    assert t2_id not in all_tag_ids
    
    # Verify set rollup tags are recalculated and empty via API
    get_set_resp = await client.get(f"/api/sets/{s_id}")
    assert get_set_resp.status_code == 200
    assert len(get_set_resp.json().get("tags", [])) == 0
