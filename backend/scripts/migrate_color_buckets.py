"""
Script to migrate existing image records by adding dominant_color_bucket column
if missing and backfilling dominant_color_bucket values from hex dominant_color.
"""
import sys
import os
from pathlib import Path
import asyncio

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy import text, select
from app.db.session import SessionLocal
from app.models.image import Image
from app.core.color_utils import get_color_bucket


async def run_migration():
    print("Starting color bucket migration...")
    async with SessionLocal() as session:
        # Check / add column if missing in SQLite database
        try:
            await session.execute(text("ALTER TABLE images ADD COLUMN dominant_color_bucket VARCHAR"))
            print("Added 'dominant_color_bucket' column to 'images' table.")
        except Exception:
            # Column already exists
            pass

        try:
            await session.execute(text("CREATE INDEX IF NOT EXISTS ix_images_dominant_color_bucket ON images (dominant_color_bucket)"))
            print("Ensured index 'ix_images_dominant_color_bucket' exists.")
        except Exception as e:
            print(f"Index creation notice: {e}")

        await session.commit()

        # Fetch images with dominant_color set but dominant_color_bucket missing
        result = await session.execute(
            select(Image).where(Image.dominant_color.is_not(None))
        )
        images = result.scalars().all()
        print(f"Found {len(images)} images to check for color bucket backfill.")

        updated_count = 0
        for img in images:
            if img.dominant_color:
                expected_bucket = get_color_bucket(img.dominant_color)
                if img.dominant_color_bucket != expected_bucket:
                    img.dominant_color_bucket = expected_bucket
                    updated_count += 1

        await session.commit()
        print(f"Migration completed successfully. Updated {updated_count} image color buckets.")


if __name__ == "__main__":
    asyncio.run(run_migration())
