import pytest
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
