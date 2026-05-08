import asyncio
import sys
import os
from pathlib import Path

# Add the backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

from app.db.session import SessionLocal
from app.models.image import Image
from sqlalchemy import select

async def check_broken():
    async with SessionLocal() as db:
        result = await db.execute(select(Image).filter(Image.local_path != None))
        images = result.scalars().all()
        
        broken = []
        for img in images:
            if not Path(img.local_path).exists():
                broken.append(img)
        
        print(f"Total images with paths: {len(images)}")
        print(f"Broken paths: {len(broken)}")
        
        if broken:
            print("\nSample broken paths:")
            for img in broken[:10]:
                print(f"ID: {img.id}, Path: {img.local_path}")

if __name__ == "__main__":
    asyncio.run(check_broken())
