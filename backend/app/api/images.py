from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.crud import image as crud_image
from app.schemas.image import Image, ImageUpdate, ImageCreate
from pathlib import Path

router = APIRouter()

@router.get("/{image_id}", response_model=Image)
async def read_image(
    image_id: int,
    db: AsyncSession = Depends(get_db)
):
    db_image = await crud_image.get_image(db, image_id=image_id)
    if db_image is None:
        raise HTTPException(status_code=404, detail="Image not found")
    return db_image

@router.patch("/{image_id}", response_model=Image)
async def update_image(
    image_id: int,
    image_in: ImageUpdate,
    db: AsyncSession = Depends(get_db)
):
    db_image = await crud_image.update_image(db, image_id=image_id, image_in=image_in)
    if db_image is None:
        raise HTTPException(status_code=404, detail="Image not found")
    return db_image

@router.delete("/{image_id}", response_model=Image)
async def delete_image(
    image_id: int,
    db: AsyncSession = Depends(get_db)
):
    db_image = await crud_image.delete_image(db, image_id=image_id)
    if db_image is None:
        raise HTTPException(status_code=404, detail="Image not found")
    return db_image

@router.get("/file/{image_id}")
async def get_image_file(
    image_id: int,
    db: AsyncSession = Depends(get_db)
):
    db_image = await crud_image.get_image(db, image_id=image_id)
    if db_image is None:
        raise HTTPException(status_code=404, detail="Image not found")
    
    file_path = Path(db_image.local_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found on disk")
    
    return FileResponse(str(file_path))

@router.post("/set/{set_id}", response_model=Image)
async def create_image_for_set(
    set_id: int,
    image_in: ImageCreate,
    db: AsyncSession = Depends(get_db)
):
    return await crud_image.create_image(db, image_in=image_in, set_id=set_id)
