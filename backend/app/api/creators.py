from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.crud import creator as crud_creator
from app.schemas.creator import Creator, CreatorCreate
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

@router.get("/{creator_id}", response_model=Creator)
async def read_creator(
        creator_id: int,
        db: AsyncSession = Depends(get_db)
):
    db_creator = await crud_creator.get_creator(db, creator_id=creator_id)
    if db_creator is None:
        raise HTTPException(status_code=404, detail="Creator not found")
    return db_creator