from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.crud import image as crud_image
from app.schemas.image import Image, ImageUpdate, ImageCreate
from pathlib import Path

router = APIRouter()

@router.get("/random/file/{ratio}/tags/{tags:path}/image.jpg")
async def read_random_image_file_path_tags(
    ratio: str,
    tags: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Get a random image file based on ratio and tags in the path (DisplayFusion compatible).
    """
    # Split by slashes now instead of commas
    tag_list = [t.strip() for t in tags.split("/") if t.strip()]
    db_image = await crud_image.get_random_image(
        db, 
        aspect_ratio_label=ratio,
        tags=tag_list
    )
    if db_image is None:
        raise HTTPException(status_code=404, detail="No images found matching criteria")
    
    file_path = Path(db_image.local_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found on disk")
    
    return FileResponse(
        str(file_path), 
        filename=db_image.filename,
        content_disposition_type="inline"
    )

@router.get("/random/file/{ratio}/image.jpg")
async def read_random_image_file_path(
    ratio: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Get a random image file based on ratio in the path (DisplayFusion compatible).
    """
    db_image = await crud_image.get_random_image(
        db, 
        aspect_ratio_label=ratio
    )
    if db_image is None:
        raise HTTPException(status_code=404, detail="No images found matching criteria")
    
    file_path = Path(db_image.local_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found on disk")
    
    return FileResponse(
        str(file_path), 
        filename=db_image.filename,
        content_disposition_type="inline"
    )

@router.get("/random", response_model=Image)
async def read_random_image(
    tags: Optional[List[str]] = Query(None),
    ratio: Optional[str] = Query(None, alias="aspect_ratio_label"),
    min_w: Optional[int] = Query(None, alias="min_width"),
    min_h: Optional[int] = Query(None, alias="min_height"),
    creator_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Get a random image based on filters.
    """
    db_image = await crud_image.get_random_image(
        db, 
        tags=tags, 
        aspect_ratio_label=ratio, 
        min_width=min_w, 
        min_height=min_h,
        creator_id=creator_id
    )
    if db_image is None:
        raise HTTPException(status_code=404, detail="No images found matching criteria")
    return db_image

@router.get("/random/file")
async def read_random_image_file(
    tags: Optional[List[str]] = Query(None),
    ratio: Optional[str] = Query(None, alias="aspect_ratio_label"),
    min_w: Optional[int] = Query(None, alias="min_width"),
    min_h: Optional[int] = Query(None, alias="min_height"),
    creator_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Get a random image file based on filters.
    """
    db_image = await crud_image.get_random_image(
        db, 
        tags=tags, 
        aspect_ratio_label=ratio, 
        min_width=min_w, 
        min_height=min_h,
        creator_id=creator_id
    )
    if db_image is None:
        raise HTTPException(status_code=404, detail="No images found matching criteria")
    
    file_path = Path(db_image.local_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found on disk")
    
    # Provide the actual filename to ensure clients like DisplayFusion don't
    # attempt to use the URL (which contains invalid filename characters like '?')
    return FileResponse(
        str(file_path), 
        filename=db_image.filename,
        content_disposition_type="inline"
    )

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
