import asyncio
import sys
import os
import cv2
import numpy as np
from pathlib import Path

# Add the backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

from app.db.session import SessionLocal
from app.models.image import Image
from sqlalchemy import select, or_
from app.core.crop import load_image

async def backfill():
    async with SessionLocal() as db:
        # Find images with 0 dimensions or missing phash
        result = await db.execute(
            select(Image).filter(
                or_(
                    Image.width == 0,
                    Image.width == None,
                    Image.phash == None
                )
            )
        )
        images = result.scalars().all()
        print(f"Found {len(images)} images needing backfill.")
        
        count = 0
        for img in images:
            if not img.local_path: continue
            p = Path(img.local_path)
            if p.exists():
                # Use load_image which handles unicode correctly via buffer
                img_data = load_image(p)
                if img_data is not None:
                    h, w = img_data.shape[:2]
                    img.width = w
                    img.height = h
                    img.aspect_ratio = float(w)/float(h) if h != 0 else 0
                    
                    # Calculate phash if missing
                    if not img.phash:
                        hasher = cv2.img_hash.PHash_create()
                        img.phash = hasher.compute(img_data).tobytes().hex()
                    
                    db.add(img)
                    count += 1
                    
                    if count % 100 == 0:
                        print(f"Processed {count}/{len(images)}...")
                        await db.commit()
        
        await db.commit()
        print(f"Backfill complete. Updated {count} images.")

if __name__ == "__main__":
    asyncio.run(backfill())
