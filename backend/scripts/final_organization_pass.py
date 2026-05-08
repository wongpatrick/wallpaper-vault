import asyncio
import sys
import os
import re
import shutil
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

def parse_final_patterns(filename):
    """
    Advanced pattern recognition for the remaining files.
    """
    # 1. [BLUECAKE] Bambi (밤비) - Autumn - ...
    m = re.match(r"^\[(.+?)\]\s*(.+?)\s+-\s+(.+?)\s+-", filename)
    if m: return f"{m.group(1)} - {m.group(2)}", m.group(3).strip()

    # 2. SAINT Photolife - Yuna (유나) - Naruto Erotic Transformation - ...
    m = re.match(r"^SAINT Photolife - (.+?)\s+-\s+(.+?)\s+-", filename)
    if m: return f"SAINT Photolife - {m.group(1)}", m.group(2).strip()

    # 3. NO.249 – Zzyuri (쮸리) – Loose and Tight Refreshing Blue - ...
    m = re.match(r"^NO\.\d+\s+[–-]\s*(.+?)\s+[–-]\s*(.+?)\s+-", filename)
    if m: return m.group(1).strip(), m.group(2).strip()

    # 4. [MTCos] kitaro_绮太郎 阳光宅女
    m = re.match(r"^\[.+?\]\s*(.+?)\s+(.+?)\s+-", filename)
    if m: return m.group(1).strip(), m.group(2).strip()

    # 5. Coser@时安安- XingYan Vol.458
    m = re.match(r"^Coser@(.+?)-\s*(.+?)\s*-", filename)
    if m: return m.group(1).strip(), m.group(2).strip()

    # 6. DJAWA Photo - Jeong Jenny (정제니) - Hatsukoi Yozakura ...
    m = re.match(r"^DJAWA Photo - (.+?) - (.+?)\s+DJAWA", filename)
    if m: return f"DJAWA - {m.group(1)}", m.group(2).strip()

    # 7. DJAWA Photo - ZziZzi - ChunLi The Fighter ...
    m = re.match(r"^DJAWA Photo - (.+?) - (.+?)\s+DJAWA", filename)
    if m: return f"DJAWA - {m.group(1)}", m.group(2).strip()

    # 8. SAINT-Photolife-Zenny-Romance-2- - ...
    m = re.match(r"^(SAINT-Photolife-.+?)-", filename)
    if m: return m.group(1).replace("-", " ").strip(), "Set"

    # 9. kpop - le_sserafim_crazy...
    m = re.match(r"^kpop\s*-\s*(.+?)\s*_", filename)
    if m: return "K-Pop", m.group(1).replace("_", " ").title().strip()

    return None, None

async def final_organize(run=False):
    async with SessionLocal() as db:
        vault_root = await get_vault_root(db)
        
        # Now we scan BOTH the Needs Organizing folder AND the generic sets we just created
        scan_dirs = [
            vault_root / "Needs Organizing",
            vault_root / "Needs Organizing - 16x10",
            vault_root / "Needs Organizing - 9x16",
            vault_root / "Needs Organizing - SFW"
        ]
        
        all_files = []
        image_exts = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff'}
        
        for d in scan_dirs:
            if d.exists():
                print(f"Scanning {d.name}...")
                for r, _, f in os.walk(d):
                    for file in f:
                        if Path(file).suffix.lower() in image_exts:
                            all_files.append(Path(r) / file)
        
        print(f"Found {len(all_files)} images to process.")

        processed_count = 0
        
        for p in all_files:
            creator_name, set_title = parse_final_patterns(p.name)
            
            # If no pattern, use folder name as set title and "Needs Organizing" as creator
            if not creator_name or not set_title:
                # Group generic files by their immediate parent folder (e.g., 16x10, 9x16)
                creator_name = "Needs Organizing"
                set_title = p.parent.name
            
            # 1. Get or Create Creator
            res = await db.execute(select(Creator).filter(Creator.canonical_name == creator_name))
            creator = res.scalars().first()
            if not creator and run:
                creator = Creator(canonical_name=creator_name)
                db.add(creator)
                await db.flush()
            
            # 2. Get or Create Set
            folder_name = sanitize_filename(f"{creator_name} - {set_title}")
            dest_dir = vault_root / folder_name

            set_query = select(Set).filter(Set.title == set_title)
            if creator:
                set_query = set_query.filter(Set.creators.contains(creator))
            
            res = await db.execute(set_query)
            dset = res.scalars().first()
            
            if not dset and run:
                dset = Set(title=set_title, local_path=str(dest_dir.resolve()))
                if creator: dset.creators.append(creator)
                db.add(dset)
                await db.flush()
            elif dset:
                dest_dir = Path(dset.local_path)

            if not dest_dir.exists() and run:
                dest_dir.mkdir(parents=True, exist_ok=True)

            # 3. Move and Index Image
            target_path = dest_dir / p.name
            if target_path.exists():
                if target_path.stat().st_size == p.stat().st_size:
                    if run: p.unlink()
                    continue
                else:
                    stem, suffix = p.stem, p.suffix
                    counter = 1
                    while (dest_dir / f"{stem}_{counter}{suffix}").exists():
                        counter += 1
                    target_path = dest_dir / f"{stem}_{counter}{suffix}"

            print(f"  Moving: {p.name} -> {folder_name}")
            if run:
                shutil.move(str(p), str(target_path))
                
                # Add/Update Image in DB
                img_res = await db.execute(select(Image).filter(Image.set_id == dset.id, Image.filename == target_path.name))
                if not img_res.scalars().first():
                    img_data = load_image(target_path)
                    h, w, phash = 0, 0, None
                    if img_data is not None:
                        h, w = img_data.shape[:2]
                        hasher = cv2.img_hash.PHash_create()
                        phash = hasher.compute(img_data).tobytes().hex()
                    
                    img = Image(
                        set_id=dset.id,
                        filename=target_path.name,
                        local_path=str(target_path.resolve()),
                        width=w, height=h,
                        file_size=target_path.stat().st_size,
                        aspect_ratio=float(w)/float(h) if h!=0 else 0,
                        phash=phash
                    )
                    db.add(img)
                
                processed_count += 1
                if processed_count % 100 == 0:
                    await db.commit()

        if run:
            await db.commit()
            print(f"\nFinal pass complete. Organized {processed_count} images.")
        else:
            print("\nDry run finished. Use --run to execute.")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", action="store_true")
    args = parser.parse_args()
    asyncio.run(final_organize(run=args.run))
