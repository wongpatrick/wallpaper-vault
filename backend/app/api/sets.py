from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db

from app.crud import set as crud_set
from app.schemas.set import Set, SetCreate


router = APIRouter()

@router.post("/", response_model=Set)
async def create_set(
        set_in: SetCreate,
        db: AsyncSession = Depends(get_db)
):
    return await crud_set.create_set(db=db, set_in=set_in)

@router.get("/", response_model=list[Set])
async def read_sets(
        skip: int = 0,
        limit: int = 100,
        db: AsyncSession = Depends(get_db)
):
    sets = await crud_set.get_sets(db, skip=skip, limit=limit)
    return sets

@router.get("/{set_id}", response_model=Set)
async def read_set(
        set_id: int,
        db: AsyncSession = Depends(get_db)
):
    db_set = await crud_set.get_set(db, set_id=set_id)
    if db_set is None:
        raise HTTPException(status_code=404, detail="Set not found")
    return db_set