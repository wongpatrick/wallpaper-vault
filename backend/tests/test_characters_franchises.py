import pytest
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
