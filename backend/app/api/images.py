from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.crud import image as crud_image
from app.schemas.image import Image, ImageUpdate, ImageCreate, ImageBulkUpdate, DuplicateGroup, DuplicateResolutionRequest, ImageWithContext, ImagePage
from pathlib import Path

router = APIRouter()

def map_image_to_schema(img) -> Image:
    """Helper to ensure image model is correctly mapped to schema with string dates."""
    return Image(
        id=img.id,
        set_id=img.set_id,
        filename=img.filename,
        local_path=img.local_path,
        phash=img.phash,
        width=img.width,
        height=img.height,
        file_size=img.file_size,
        aspect_ratio=img.aspect_ratio,
        aspect_ratio_label=img.aspect_ratio_label,
        sort_order=img.sort_order,
        notes=img.notes,
        rating=img.rating,
        dominant_color=img.dominant_color,
        tags=img.tags,
        date_added=str(img.date_added)
    )

def map_image_to_context_schema(img) -> ImageWithContext:
    """Helper to map image with set/creator context."""
    base = map_image_to_schema(img)
    return ImageWithContext(
        **base.model_dump(),
        set_title=img.set.title,
        creator_names=[c.canonical_name for c in img.set.creators]
    )

@router.post("/bulk-update", response_model=int)
async def bulk_update_images(
    bulk_in: ImageBulkUpdate,
    db: AsyncSession = Depends(get_db)
):
    """
    Update multiple images at once.
    """
    return await crud_image.bulk_update_images(db=db, bulk_in=bulk_in)

@router.get("/", response_model=ImagePage)
async def read_images(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    rating: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Get a paginated list of all images with optional comprehensive search and rating filter.
    """
    images, total = await crud_image.get_images(db, skip=skip, limit=limit, search=search, rating=rating)
    items = [map_image_to_context_schema(img) for img in images]
    return ImagePage(items=items, total=total, skip=skip, limit=limit)

@router.get("/duplicates/groups", response_model=List[DuplicateGroup])
async def read_duplicate_groups(
    db: AsyncSession = Depends(get_db)
):
    """
    Get all groups of duplicate images.
    """
    groups_dict = await crud_image.get_duplicate_groups(db)
    
    result = []
    for phash, img_list in groups_dict.items():
        images_with_context = [map_image_to_context_schema(img) for img in img_list]
        
        # Sort: Highest resolution first
        def score_img(img):
            score = 0
            if "Needs Organizing" not in (" ".join(img.creator_names)):
                score += 1000
            
            # Use 0 if width/height is missing
            w = img.width or 0
            h = img.height or 0
            score += (w * h) / 1000000
            return score
            
        images_with_context.sort(key=score_img, reverse=True)
        
        result.append(
            DuplicateGroup(
                phash=phash,
                images=images_with_context,
                recommended_keep_id=images_with_context[0].id
            )
        )
    
    return result

@router.post("/duplicates/resolve")
async def resolve_duplicates(
    request: DuplicateResolutionRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Resolve a duplicate group by keeping one image and removing others.
    """
    try:
        removed, saved = await crud_image.resolve_duplicates(
            db, 
            keep_id=request.keep_image_id, 
            remove_ids=request.remove_image_ids
        )
        return {"status": "success", "removed_count": removed, "space_saved_bytes": saved}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/random/file/{ratio}/tags/{tags:path}/image.jpg")
async def read_random_image_file_path_tags(
    ratio: str,
    tags: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Get a random image file based on ratio and tags in the path (DisplayFusion compatible).
    """
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
    return map_image_to_schema(db_image)

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
    return map_image_to_schema(db_image)

@router.patch("/{image_id}", response_model=Image)
async def update_image(
    image_id: int,
    image_in: ImageUpdate,
    db: AsyncSession = Depends(get_db)
):
    db_image = await crud_image.update_image(db, image_id=image_id, image_in=image_in)
    if db_image is None:
        raise HTTPException(status_code=404, detail="Image not found")
    return map_image_to_schema(db_image)

@router.delete("/{image_id}", response_model=Image)
async def delete_image(
    image_id: int,
    db: AsyncSession = Depends(get_db)
):
    db_image = await crud_image.delete_image(db, image_id=image_id)
    if db_image is None:
        raise HTTPException(status_code=404, detail="Image not found")
    return map_image_to_schema(db_image)

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
    db_image = await crud_image.create_image(db, image_in=image_in, set_id=set_id)
    return map_image_to_schema(db_image)
