"""API endpoints for characters."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.db.session import get_db
from app.crud import character as crud_character
from app.schemas.character import Character, CharacterCreate, CharacterUpdate, CharacterMerge
from app.schemas.bulk import BulkDeleteRequest

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
    # Ensure character name is unique within its franchise
    existing = await crud_character.get_character_by_name_and_franchise_id(
        db, 
        character.name.strip().title(), 
        character.franchise_id
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Character already exists under this franchise."
        )
    result = await crud_character.create_character(db, character)
    await db.commit()
    return result

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
    await db.commit()
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
    await db.commit()

@router.post("/bulk-delete", status_code=status.HTTP_204_NO_CONTENT)
async def bulk_delete_characters(
    request: BulkDeleteRequest,
    db: AsyncSession = Depends(get_db)
):
    """Bulk delete multiple characters."""
    await crud_character.bulk_delete_characters(db, request.ids)
    await db.commit()
    return None


@router.post("/merge", response_model=Character)
async def merge_characters(
    merge_in: CharacterMerge,
    db: AsyncSession = Depends(get_db)
):
    """Merge multiple characters into one."""
    if merge_in.target_id in merge_in.source_ids:
        raise HTTPException(status_code=400, detail="Cannot merge a character into itself")
        
    db_character = await crud_character.merge_characters(
        db, 
        source_ids=merge_in.source_ids, 
        target_id=merge_in.target_id
    )
    if not db_character:
        raise HTTPException(status_code=404, detail="Target character not found")
        
    await db.commit()
    return db_character
