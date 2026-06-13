import asyncio
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models.image import Image
from app.core.crop import compute_focal_point, load_image

async def backfill():
    batch_size = 50
    total_processed = 0

    print('Starting backfill...')
    while True:
        async with SessionLocal() as db:
            result = await db.execute(select(Image).where(Image.focal_point_x == 50, Image.focal_point_y == 50).limit(batch_size))
            images = result.scalars().all()
            
            if not images:
                break
                
            for img in images:
                img_data = load_image(img.local_path)
                if img_data is not None:
                    fx, fy = compute_focal_point(img_data)
                    img.focal_point_x = fx
                    img.focal_point_y = fy
            
            await db.commit()
            total_processed += len(images)
            print(f'Processed {total_processed} images...', flush=True)

    print(f'Backfill complete! Processed {total_processed} images.')

if __name__ == '__main__':
    asyncio.run(backfill())
