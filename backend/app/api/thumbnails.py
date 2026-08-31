"""
API endpoints for generating and serving image thumbnails with on-disk caching.
"""
from enum import Enum
from pathlib import Path

import anyio
import cv2
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.image import Image

logger = structlog.get_logger(__name__)

router = APIRouter()

# Thumbnail cache directory: <project_root>/db/thumbs/
THUMBS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "db" / "thumbs"

# Width presets for each thumbnail size
SIZE_WIDTHS = {
    "sm": 200,
    "md": 400,
    "lg": 800,
}


class ThumbSize(str, Enum):
    sm = "sm"
    md = "md"
    lg = "lg"


def _generate_thumbnail_file(original_path: Path, thumb_path: Path, target_width: int) -> bool:
    """Generate and write thumbnail to disk synchronously."""
    try:
        THUMBS_DIR.mkdir(parents=True, exist_ok=True)
        import numpy as np

        with open(original_path, "rb") as f:
            img_array = np.frombuffer(f.read(), dtype=np.uint8)

        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        if img is None:
            return False

        h, w = img.shape[:2]
        if w <= 0 or h <= 0:
            return False

        scale = target_width / w
        target_height = int(h * scale)

        resized = cv2.resize(img, (target_width, target_height), interpolation=cv2.INTER_AREA)
        cv2.imwrite(str(thumb_path), resized, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return True
    except Exception:
        return False


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
    # 1. Check for a cached thumbnail first to bypass DB lookup entirely
    thumb_filename = f"{image_id}_{size.value}.jpg"
    thumb_path = THUMBS_DIR / thumb_filename

    if thumb_path.exists():
        return FileResponse(
            str(thumb_path),
            media_type="image/jpeg",
            headers={"Cache-Control": "no-cache"},
        )

    # 2. Look up the image local_path with a lightweight projection query
    res = await db.execute(select(Image.local_path).where(Image.id == image_id))
    local_path = res.scalar_one_or_none()
    if local_path is None:
        raise HTTPException(status_code=404, detail="Image not found")

    original_path = Path(local_path)
    if not original_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found on disk")

    # 3. Generate thumbnail offloaded to thread pool
    target_width = SIZE_WIDTHS[size.value]
    success = await anyio.to_thread.run_sync(
        _generate_thumbnail_file, original_path, thumb_path, target_width
    )
    if not success:
        raise HTTPException(
            status_code=500, detail="Failed to read image for thumbnail generation"
        )

    logger.info(
        "Generated thumbnail",
        image_id=image_id,
        size=size.value,
        dimensions=f"{target_width}w",
    )

    return FileResponse(
        str(thumb_path),
        media_type="image/jpeg",
        headers={"Cache-Control": "no-cache"},
    )


