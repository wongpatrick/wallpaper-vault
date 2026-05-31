"""
API endpoints for generating and serving image thumbnails with on-disk caching.
"""
from enum import Enum
from pathlib import Path

import cv2
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import image as crud_image
from app.db.session import get_db

logger = structlog.get_logger(__name__)

router = APIRouter()

# Thumbnail cache directory: <project_root>/db/thumbs/
THUMBS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "db" / "thumbs"

# Width presets for each thumbnail size
SIZE_WIDTHS = {
    "sm": 200,
    "md": 400,
}


class ThumbSize(str, Enum):
    sm = "sm"
    md = "md"


@router.get("/thumb/{image_id}")
async def get_image_thumbnail(
    image_id: int,
    size: ThumbSize = Query(ThumbSize.sm),
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    """
    Serve a cached JPEG thumbnail for the requested image ID.
    
    If the thumbnail does not exist in the on-disk cache (`db/thumbs/`), it is generated on-the-fly from the original high-resolution image using OpenCV and then served. Future requests will serve the cached file directly.
    """
    # 1. Look up the image record
    db_image = await crud_image.get_image(db, image_id=image_id)
    if db_image is None:
        raise HTTPException(status_code=404, detail="Image not found")

    original_path = Path(db_image.local_path)
    if not original_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found on disk")

    # 2. Ensure the cache directory exists
    THUMBS_DIR.mkdir(parents=True, exist_ok=True)

    # 3. Check for a cached thumbnail
    thumb_filename = f"{image_id}_{size.value}.jpg"
    thumb_path = THUMBS_DIR / thumb_filename

    if not thumb_path.exists():
        # 4. Generate the thumbnail with OpenCV
        # cv2.imread fails on Windows with Unicode paths, so we use numpy + imdecode
        import numpy as np
        
        # Read the file bytes directly to bypass OpenCV's path encoding issues
        img_array = np.fromfile(str(original_path), np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(
                status_code=500, detail="Failed to read image for thumbnail generation"
            )

        target_width = SIZE_WIDTHS[size.value]
        h, w = img.shape[:2]
        scale = target_width / w
        target_height = int(h * scale)

        resized = cv2.resize(img, (target_width, target_height), interpolation=cv2.INTER_AREA)
        cv2.imwrite(str(thumb_path), resized, [cv2.IMWRITE_JPEG_QUALITY, 85])

        logger.info(
            "Generated thumbnail",
            image_id=image_id,
            size=size.value,
            dimensions=f"{target_width}x{target_height}",
        )

    return FileResponse(
        str(thumb_path),
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )
