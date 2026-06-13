"""API endpoints for characters."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.db.session import get_db
from app.crud import character as crud_character
from app.schemas.character import Character, CharacterCreate, CharacterUpdate

router = APIRouter()

@router.get("/", response_model=List[Character])
async def read_characters(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """Retrieve all characters."""
    characters = await crud_character.get_characters(db, skip=skip, limit=limit)
    return characters

@router.post("/", response_model=Character)
async def create_character(
    character: CharacterCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new character."""
    # Ensure name is unique
    existing = await crud_character.get_character_by_name(db, character.name.strip().title())
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Character already exists."
        )
    return await crud_character.create_character(db, character)

@router.patch("/{character_id}", response_model=Character)
async def update_character(
    character_id: int,
    character_in: CharacterUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update a character's name or franchise."""
    db_character = await crud_character.update_character(db, character_id, character_in)
    if not db_character:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")
    return db_character

@router.delete("/{character_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_character(
    character_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Delete a character."""
    success = await crud_character.delete_character(db, character_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")
