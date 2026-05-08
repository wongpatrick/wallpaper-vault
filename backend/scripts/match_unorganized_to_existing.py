import asyncio
import sys
import os
import re
import shutil
import difflib
import cv2
from pathlib import Path

# Add backend to path
sys.path.append(str(Path.cwd()))

from app.db.session import SessionLocal
from app.models.image import Image
from app.models.set import Set
from app.models.creator import Creator
from app.models.settings import Setting
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.utils import sanitize_filename
from app.core.crop import load_image

async def get_vault_root(db):
    result = await db.execute(select(Setting).filter(Setting.key == "base_library_path"))
    setting = result.scalars().first()
    return Path(setting.value) if setting else None

async def organize_remaining(run=False):
    async with SessionLocal() as db:
        vault_root = await get_vault_root(db)
        unorganized_dir = vault_root / "Needs Organizing"
        if not unorganized_dir.exists():
            print("Needs Organizing folder not found.")
            return

        # 1. Load all existing Creators and Sets for matching
        print("Loading Creators and Sets from database...")
        res = await db.execute(select(Creator))
        creators = res.scalars().all()
        creator_names = {c.canonical_name.lower(): c for c in creators}
        
        res = await db.execute(select(Set).options(selectinload(Set.creators)))
        sets = res.scalars().all()
        
        # Build a searchable index of existing sets
        # key: (creator_name_lower, set_title_lower) -> Set object
        set_map = {}
        for s in sets:
            c_name = s.creators[0].canonical_name.lower() if s.creators else "needs organizing"
            set_map[(c_name, s.title.lower())] = s

        print(f"Indexed {len(creator_names)} creators and {len(sets)} sets.")

        # 2. Scan Needs Organizing
        image_exts = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff'}
        all_files = []
        for r, d, f in os.walk(unorganized_dir):
            for file in f:
                if Path(file).suffix.lower() in image_exts:
                    all_files.append(Path(r) / file)
        
        print(f"Found {len(all_files)} images in 'Needs Organizing'.")

        matches = [] # (file_path, Set object, match_type)
        
        for p in all_files:
            filename = p.name
            
            # Strategy 1: Look for exact creator and set title in filename
            # We look for "[Creator] - [Set Title]" or similar
            found_set = None
            match_type = ""

            # Sort creators by length descending to match longest name first (e.g. "蠢沫沫" vs "蠢")
            sorted_creators = sorted(creators, key=lambda x: len(x.canonical_name), reverse=True)
            
            for c in sorted_creators:
                c_name = c.canonical_name
                if c_name.lower() in filename.lower():
                    # Possible creator match, now look for set title
                    # Filter sets for this creator
                    creator_sets = [s for s in sets if any(cr.id == c.id for cr in s.creators)]
                    
                    # Sort sets by title length descending
                    sorted_sets = sorted(creator_sets, key=lambda x: len(x.title), reverse=True)
                    for s in sorted_sets:
                        if s.title.lower() in filename.lower():
                            found_set = s
                            match_type = "substring"
                            break
                if found_set: break
            
            if found_set:
                matches.append((p, found_set, match_type))

        print(f"Identified {len(matches)} potential matches via substring search.")

        # 3. Execute Moves
        if matches:
            for p, s, m_type in matches:
                dest_dir = Path(s.local_path)
                if not dest_dir.exists() and run:
                    dest_dir.mkdir(parents=True, exist_ok=True)
                
                target_path = dest_dir / p.name
                # Handle collision
                if target_path.exists():
                    if target_path.stat().st_size == p.stat().st_size:
                        print(f"  [Skip] Already exists: {p.name}")
                        if run: p.unlink() # Safe to delete if identical size
                        continue
                    else:
                        stem, suffix = p.stem, p.suffix
                        counter = 1
                        while (dest_dir / f"{stem}_{counter}{suffix}").exists():
                            counter += 1
                        target_path = dest_dir / f"{stem}_{counter}{suffix}"

                print(f"  [Match: {m_type}] {p.name} -> {s.title}")
                if run:
                    shutil.move(str(p), str(target_path))
                    
                    # Add to DB if not exists
                    img_res = await db.execute(select(Image).filter(Image.set_id == s.id, Image.filename == target_path.name))
                    if not img_res.scalars().first():
                        img_data = load_image(target_path)
                        h, w = (0, 0)
                        phash = None
                        if img_data is not None:
                            h, w = img_data.shape[:2]
                            hasher = cv2.img_hash.PHash_create()
                            phash = hasher.compute(img_data).tobytes().hex()
                        
                        img = Image(
                            set_id=s.id,
                            filename=target_path.name,
                            local_path=str(target_path.resolve()),
                            width=w, height=h,
                            file_size=target_path.stat().st_size,
                            aspect_ratio=float(w)/float(h) if h!=0 else 0,
                            phash=phash
                        )
                        db.add(img)
            
            if run:
                await db.commit()
                print("\nOrganization complete.")
            else:
                print("\nDry run finished. Use --run to execute.")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", action="store_true")
    args = parser.parse_args()
    asyncio.run(organize_remaining(run=args.run))
