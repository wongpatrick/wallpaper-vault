import asyncio
import sys
from pathlib import Path

# Add the backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

from app.db.session import SessionLocal
from app.models.image import Image
from sqlalchemy import select, func

async def check():
    async with SessionLocal() as db:
        total = (await db.execute(select(func.count(Image.id)))).scalar()
        with_phash = (await db.execute(select(func.count(Image.id)).filter(Image.phash != None))).scalar()
        print(f"Total images: {total}")
        print(f"Images with pHash: {with_phash}")
        
        if total > 0:
            sample = (await db.execute(select(Image).limit(5))).scalars().all()
            for img in sample:
                print(f"ID: {img.id}, Filename: {img.filename}, pHash: {img.phash}, Path: {img.local_path}")

if __name__ == "__main__":
    asyncio.run(check())
