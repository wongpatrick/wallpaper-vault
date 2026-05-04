from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.crud import creator as crud_creator
from app.schemas.creator import Creator, CreatorCreate, CreatorWithSets, CreatorMerge
from sqlalchemy.exc import IntegrityError

router = APIRouter()

@router.post("/", response_model=Creator)
async def create_creator(
        creator: CreatorCreate,
        db: AsyncSession = Depends(get_db)
):
    try:
        return await crud_creator.create_creator(db=db, creator=creator)
    except IntegrityError as e:
        error_msg = str(e.orig)
        if "UNIQUE constraint failed" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail=f"A creator with the name '{creator.canonical_name}' already exists!"
            )

        raise e 

@router.get("/", response_model=list[Creator])
async def read_creators(
        skip: int = 0,
        limit: int = 100,
        db: AsyncSession = Depends(get_db)
):
    creators = await crud_creator.get_creators(db, skip=skip, limit=limit)
    return creators

@router.get("/{creator_id}", response_model=CreatorWithSets)
async def read_creator(
        creator_id: int,
        db: AsyncSession = Depends(get_db)
):
    db_creator = await crud_creator.get_creator(db, creator_id=creator_id)
    if db_creator is None:
        raise HTTPException(status_code=404, detail="Creator not found")
    return db_creator

@router.patch("/{creator_id}", response_model=Creator)
async def update_creator(
        creator_id: int,
        creator_in: crud_creator.CreatorUpdate,
        db: AsyncSession = Depends(get_db)
):
    db_creator = await crud_creator.update_creator(db, creator_id=creator_id, creator_in=creator_in)
    if db_creator is None:
        raise HTTPException(status_code=404, detail="Creator not found")
    return db_creator

@router.delete("/{creator_id}", response_model=Creator)
async def delete_creator(
        creator_id: int,
        db: AsyncSession = Depends(get_db)
):
    db_creator = await crud_creator.delete_creator(db, creator_id=creator_id)
    if db_creator is None:
        raise HTTPException(status_code=404, detail="Creator not found")
    return db_creator

@router.post("/merge", response_model=Creator)
async def merge_creators(
    merge_in: CreatorMerge,
    db: AsyncSession = Depends(get_db)
):
    if merge_in.source_id == merge_in.target_id:
        raise HTTPException(status_code=400, detail="Cannot merge a creator into itself")

    db_creator = await crud_creator.merge_creators(
        db, 
        source_id=merge_in.source_id, 
        target_id=merge_in.target_id
    )
    if db_creator is None:
        raise HTTPException(status_code=404, detail="One or both creators not found")
    return db_creator