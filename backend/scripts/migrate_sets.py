import sys
import os
import asyncio
import argparse
import shutil
import difflib
import re
import cv2
import numpy as np
from pathlib import Path

# Add the backend directory to sys.path to allow imports from 'app'
backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import func
from app.db.session import SessionLocal
from app.models.set import Set
from app.models.image import Image
from app.models.settings import Setting
from app.core.utils import sanitize_filename
from app.core.crop import load_image

# Default search directory
DEFAULT_SEARCH_DIR = r"C:\Users\wongp\Pictures\Wallpaper"

def calculate_phash(path):
    """Calculates the pHash of an image at the given path."""
    try:
        img = load_image(path)
        if img is None:
            return None
        hasher = cv2.img_hash.PHash_create()
        hash_arr = hasher.compute(img)
        return hash_arr.tobytes().hex()
    except Exception as e:
        # print(f"Error hashing {path}: {e}")
        return None

async def get_vault_root(db):
    result = await db.execute(select(Setting).filter(Setting.key == "base_library_path"))
    setting = result.scalars().first()
    if not setting or not setting.value:
        print("Error: 'base_library_path' not set in database settings.")
        sys.exit(1)
    return Path(setting.value)

def get_all_search_files(root_dir: Path):
    print(f"Scanning {root_dir} for images...")
    files = []
    if not root_dir.exists():
        print(f"Warning: Search directory {root_dir} does not exist.")
        return []

    # Supported image extensions
    image_exts = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff'}

    for r, d, f in os.walk(root_dir):
        for file in f:
            if Path(file).suffix.lower() in image_exts:
                files.append(Path(r) / file)

    print(f"Found {len(files)} potential images in search directory.")
    return files

def find_match(image_filename, set_title, candidate_files, target_phash=None, phash_cache=None):
    """
    Fuzzy matching logic:
    1. Exact filename match
    2. Case-insensitive exact filename match
    3. pHash match (if target_phash is provided)
    4. Fuzzy filename match
    5. Substring match for Set Title
    """
    # 1. Exact filename match
    for f in candidate_files:
        if f.name == image_filename:
            return f, "direct"

    # 2. Case-insensitive exact filename match
    for f in candidate_files:
        if f.name.lower() == image_filename.lower():
            return f, "case-insensitive"

    # 3. pHash match
    if target_phash and phash_cache is not None:
        for f in candidate_files:
            f_str = str(f.resolve())
            if f_str not in phash_cache:
                phash_cache[f_str] = calculate_phash(f)

            if phash_cache[f_str] == target_phash:
                return f, "phash"

    # 4. Fuzzy filename match
    names = [f.name for f in candidate_files]
    matches = difflib.get_close_matches(image_filename, names, n=1, cutoff=0.8)
    if matches:
        match_name = matches[0]
        for f in candidate_files:
            if f.name == match_name:
                return f, "fuzzy-filename"

    # 5. Fallback to Set Title match
    if set_title:
        title_matches = []
        for f in candidate_files:
            if set_title.lower() in f.name.lower():
                title_matches.append(f)

        if title_matches:
            title_matches.sort(key=lambda x: (len(x.name), x.name))
            return title_matches[0], "title-substring"

    return None, None

async def index_vault(db):
    """Backfills pHashes for images already in the vault."""
    print("\n--- Indexing Vault ---")
    result = await db.execute(
        select(Image).filter(Image.phash == None, Image.local_path != None)
    )
    images = result.scalars().all()
    print(f"Found {len(images)} images in vault missing pHash.")

    count = 0
    for img in images:
        p = Path(img.local_path)
        if p.exists():
            h = calculate_phash(p)
            if h:
                img.phash = h
                db.add(img)
                count += 1
                if count % 100 == 0:
                    print(f"Indexed {count}/{len(images)}...")
                    await db.commit()

    await db.commit()
    print(f"Vault indexing complete. Added {count} pHashes.")

async def migrate(search_dir, dry_run=True, run_index=False):
    async with SessionLocal() as db:
        if run_index:
            await index_vault(db)

        vault_root = await get_vault_root(db)
        print(f"Vault root: {vault_root}")

        search_files = get_all_search_files(Path(search_dir))
        used_search_files = set()
        phash_cache = {} # path -> phash

        # Load all sets with creators and images
        result = await db.execute(
            select(Set).options(
                selectinload(Set.creators),
                selectinload(Set.images)
            )
        )
        sets = result.scalars().all()
        print(f"Found {len(sets)} sets in database.")

        for s in sets:
            creator_names = [c.canonical_name.strip(" -") for c in s.creators]
            if not creator_names:
                joined_creators = "Needs Organizing"
            else:
                joined_creators = " & ".join(creator_names)
            
            folder_name = sanitize_filename(f"{joined_creators} - {s.title}")
            dest_dir = vault_root / folder_name

            # Check if set needs attention
            needs_migration = any(not img.local_path or not Path(img.local_path).exists() for img in s.images)
            if not needs_migration:
                continue

            print(f"\n[{s.id}] Set: {s.title}")
            print(f"    Target: {dest_dir}")

            if not dry_run:
                dest_dir.mkdir(parents=True, exist_ok=True)

            for img in s.images:
                source_path = Path(img.local_path) if img.local_path else None
                found_file = None
                match_method = "direct"

                if source_path and source_path.exists():
                    found_file = source_path
                else:
                    candidates = [f for f in search_files if f not in used_search_files]
                    found_file, match_method = find_match(
                        img.filename, 
                        s.title or "", 
                        candidates, 
                        target_phash=img.phash,
                        phash_cache=phash_cache
                    )

                    if found_file:
                        used_search_files.add(found_file)

                if found_file:
                    new_path = dest_dir / found_file.name
                    if dry_run:
                        print(f"    - [DRY RUN] Would move ({match_method}): {found_file.name}")
                    else:
                        try:
                            if found_file.resolve() != new_path.resolve():
                                # Handle collision
                                if new_path.exists():
                                    stem = new_path.stem
                                    suffix = new_path.suffix
                                    counter = 1
                                    while (dest_dir / f"{stem}_{counter}{suffix}").exists():
                                        counter += 1
                                    new_path = dest_dir / f"{stem}_{counter}{suffix}"

                                shutil.move(str(found_file), str(new_path))

                            img.local_path = str(new_path.resolve())
                            img.filename = new_path.name
                            if not img.phash:
                                img.phash = phash_cache.get(str(found_file.resolve())) or calculate_phash(new_path)
                            db.add(img)
                            print(f"    - Moved ({match_method}): {new_path.name}")
                        except Exception as e:
                            print(f"    ! Error moving {found_file.name}: {e}")
                else:
                    print(f"    - NOT FOUND: {img.filename} (pHash: {img.phash})")

            if not dry_run:
                s.local_path = str(dest_dir.resolve())
                db.add(s)
                await db.commit()

        if not dry_run:
            print("\nMigration completed successfully.")
        else:
            print("\nDry run completed. No changes made.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Reorganize wallpaper sets and images.")
    parser.add_argument("--run", action="store_true", help="Actually execute the migration.")
    parser.add_argument("--index", action="store_true", help="Backfill pHashes for existing vault images.")
    parser.add_argument("--search-dir", default=DEFAULT_SEARCH_DIR, help="Directory to search for missing images.")
    args = parser.parse_args()

    try:
        asyncio.run(migrate(args.search_dir, dry_run=not args.run, run_index=args.index))
    except KeyboardInterrupt:
        print("\nAborted by user.")
    except Exception as e:
        print(f"\nAn error occurred: {e}")
        import traceback
        traceback.print_exc()
