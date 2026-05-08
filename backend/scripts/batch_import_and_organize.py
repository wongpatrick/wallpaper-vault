import sys
import os
import asyncio
import shutil
import re
import cv2
import numpy as np
from pathlib import Path

# Add the backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from app.db.session import SessionLocal
from app.models.set import Set
from app.models.image import Image
from app.models.creator import Creator
from app.models.settings import Setting
from app.core.utils import sanitize_filename
from app.core.crop import load_image

SEARCH_DIR = r"C:\Users\wongp\Pictures\Wallpaper"

def calculate_phash(path):
    try:
        img = load_image(path)
        if img is None: return None
        hasher = cv2.img_hash.PHash_create()
        return hasher.compute(img).tobytes().hex()
    except: return None

async def get_vault_root(db):
    result = await db.execute(select(Setting).filter(Setting.key == "base_library_path"))
    setting = result.scalars().first()
    return Path(setting.value) if setting else None

def parse_metadata(filename):
    """
    Tries to extract Creator and Set Title from filename.
    """
    # Pattern 1: #蠢沫沫 NO.347 春 [157P-3.69 GB] #20250126e - c (110).jpg
    m1 = re.match(r"^#(.+?)\s+NO\.\d+\s+(.+?)\s+\[", filename)
    if m1:
        return m1.group(1).strip(), m1.group(2).strip()

    # Pattern 2: (Cosplay) 星之迟迟 舟本 《Heartbeat》 - 002_1_2.jpg
    m2 = re.match(r"^\(Cosplay\)\s+(.+?)\s+(.+?)\s+-\s+\d+", filename)
    if m2:
        return m2.group(1).strip(), m2.group(2).strip()

    # Pattern 3: Coser@51酱 - 九月制服 - ...
    m3 = re.match(r"^Coser@(.+?)\s+-\s+(.+?)\s+-", filename)
    if m3:
        return m3.group(1).strip(), m3.group(2).strip()

    # Pattern 4: Fallback for "Creator - Title - Index"
    m4 = re.match(r"^(.+?)\s+-\s+(.+?)\s+-\s+\d+", filename)
    if m4:
        return m4.group(1).strip(), m4.group(2).strip()

    return None, None

async def organize(dry_run=False):
    async with SessionLocal() as db:
        vault_root = await get_vault_root(db)
        if not vault_root:
            print("Vault root not found!")
            return

        print(f"Scanning {SEARCH_DIR}...")
        image_exts = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff'}
        all_files = []
        for r, d, f in os.walk(SEARCH_DIR):
            for file in f:
                if Path(file).suffix.lower() in image_exts:
                    all_files.append(Path(r) / file)
        
        print(f"Found {len(all_files)} images.")

        # Group by detected metadata
        groups = {} # (creator, title) -> [paths]
        loose_files = []

        for p in all_files:
            creator, title = parse_metadata(p.name)
            if creator and title:
                key = (creator, title)
                if key not in groups: groups[key] = []
                groups[key].append(p)
            else:
                loose_files.append(p)

        print(f"Grouped into {len(groups)} potential sets. {len(loose_files)} loose files.")

        # Process groups
        for (creator_name, set_title), paths in groups.items():
            print(f"\nProcessing Set: {creator_name} - {set_title} ({len(paths)} images)")
            
            # 1. Get or Create Creator
            res = await db.execute(select(Creator).filter(Creator.canonical_name == creator_name))
            creator = res.scalars().first()
            if not creator and not dry_run:
                creator = Creator(canonical_name=creator_name)
                db.add(creator)
                await db.flush()
            
            # 2. Get or Create Set
            # Use creator_id if we have it
            set_query = select(Set).filter(Set.title == set_title)
            if creator:
                set_query = set_query.filter(Set.creators.contains(creator))
            
            res = await db.execute(set_query)
            dset = res.scalars().first()
            
            folder_name = sanitize_filename(f"{creator_name} - {set_title}")
            dest_dir = vault_root / folder_name

            if not dset and not dry_run:
                dset = Set(title=set_title, local_path=str(dest_dir.resolve()))
                if creator: dset.creators.append(creator)
                db.add(dset)
                await db.flush()
            elif dset:
                dest_dir = Path(dset.local_path)

            if not dry_run:
                dest_dir.mkdir(parents=True, exist_ok=True)

            # 3. Process Images
            for p in paths:
                # Check if image already in DB by pHash? 
                # (Optional: might be slow, but safe)
                # For now, let's assume if it's in this folder and the set exists, we just move it.
                
                target_path = dest_dir / p.name
                if target_path.exists():
                    # If it exists, maybe it's the same file. Check size?
                    if target_path.stat().st_size == p.stat().st_size:
                        if not dry_run: 
                            print(f"      Skipping (already exists): {p.name}")
                            # Optionally delete the source?
                            # p.unlink()
                        continue
                    else:
                        # Collision
                        stem, suffix = p.stem, p.suffix
                        counter = 1
                        while (dest_dir / f"{stem}_{counter}{suffix}").exists():
                            counter += 1
                        target_path = dest_dir / f"{stem}_{counter}{suffix}"

                print(f"      Moving: {p.name} -> {target_path.name}")
                if not dry_run:
                    shutil.move(str(p), str(target_path))
                    
                    # Update DB
                    # Does this image exist in the set?
                    img_res = await db.execute(select(Image).filter(Image.set_id == dset.id, Image.filename == target_path.name))
                    img = img_res.scalars().first()
                    
                    if not img:
                        # Add new image record
                        # Try to get dims
                        img_data = cv2.imread(str(target_path))
                        h, w = (0, 0)
                        if img_data is not None:
                            h, w = img_data.shape[:2]
                        
                        img = Image(
                            set_id=dset.id,
                            filename=target_path.name,
                            local_path=str(target_path.resolve()),
                            width=w, height=h,
                            file_size=target_path.stat().st_size,
                            aspect_ratio=float(w)/float(h) if h!=0 else 0
                        )
                        db.add(img)
                    else:
                        # Update existing
                        img.local_path = str(target_path.resolve())
                        db.add(img)

            if not dry_run:
                await db.commit()

        # Handle loose files (Move to Needs Organizing)
        if loose_files:
            print(f"\nMoving {len(loose_files)} loose files to 'Needs Organizing'...")
            organize_dir = vault_root / "Needs Organizing"
            if not dry_run: organize_dir.mkdir(parents=True, exist_ok=True)
            
            for p in loose_files:
                # Try to preserve subfolder structure if it's meaningful (e.g. Christmas)
                rel_path = p.relative_to(SEARCH_DIR)
                target_path = organize_dir / rel_path
                
                if not dry_run:
                    target_path.parent.mkdir(parents=True, exist_ok=True)
                    if not target_path.exists():
                        print(f"      Moving loose: {p.name}")
                        shutil.move(str(p), str(target_path))
                    else:
                        print(f"      Skipping loose (exists): {p.name}")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", action="store_true")
    args = parser.parse_args()
    
    asyncio.run(organize(dry_run=not args.run))
