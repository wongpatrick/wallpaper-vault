import asyncio
import sys
import os
import cv2
from pathlib import Path

# Add backend to path
sys.path.append(str(Path.cwd()))

from app.db.session import SessionLocal
from app.models.image import Image
from app.models.set import Set
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.models.settings import Setting
from app.core.crop import load_image

async def get_vault_root(db):
    result = await db.execute(select(Setting).filter(Setting.key == "base_library_path"))
    setting = result.scalars().first()
    return Path(setting.value) if setting else None

def calculate_phash(path):
    try:
        img = load_image(path)
        if img is None: return None
        hasher = cv2.img_hash.PHash_create()
        return hasher.compute(img).tobytes().hex()
    except: return None

async def identify():
    async with SessionLocal() as db:
        vault_root = await get_vault_root(db)
        if not vault_root:
            print("Vault root not found!")
            return

        unorganized_dir = vault_root / "Needs Organizing"
        if not unorganized_dir.exists():
            print("Needs Organizing folder does not exist.")
            return

        print(f"Scanning {unorganized_dir} for untracked images...")
        image_exts = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff'}
        unorganized_files = []
        for r, d, f in os.walk(unorganized_dir):
            for file in f:
                if Path(file).suffix.lower() in image_exts:
                    unorganized_files.append(Path(r) / file)
        
        print(f"Found {len(unorganized_files)} unorganized images.")

        # Load all known pHashes from DB
        print("Loading known pHashes from database...")
        result = await db.execute(
            select(Image)
            .filter(Image.phash != None)
            .options(selectinload(Image.set).selectinload(Set.creators))
        )
        known_images = result.scalars().all()
        
        phash_map = {} # phash -> [Image objects]
        for img in known_images:
            if img.phash not in phash_map: phash_map[img.phash] = []
            phash_map[img.phash].append(img)
        
        print(f"Indexed {len(phash_map)} unique pHashes from database.")

        matches = []
        count = 0
        for p in unorganized_files:
            count += 1
            if count % 100 == 0:
                print(f"Processing {count}/{len(unorganized_files)}...")

            h = calculate_phash(p)
            if h and h in phash_map:
                match_imgs = phash_map[h]
                matches.append((p, match_imgs))
        
        print(f"\n--- Results ---")
        print(f"Identified {len(matches)} images in 'Needs Organizing' that already exist in your Vault.")
        
        if matches:
            print("\nSample matches:")
            for p, db_imgs in matches[:10]:
                print(f"\nUnorganized: {p.name}")
                for db_img in db_imgs:
                    creators = " & ".join([c.canonical_name for c in db_img.set.creators])
                    print(f"  -> Matches Vault Image ID {db_img.id} in set: {creators} - {db_img.set.title}")
                    print(f"     Path: {db_img.local_path}")

        print(f"\nTotal matches found: {len(matches)} / {len(unorganized_files)}")
        if len(matches) > 0:
            print(f"Success! {len(matches)} files can be safely removed from 'Needs Organizing' because they are already in organized sets.")

if __name__ == "__main__":
    asyncio.run(identify())
