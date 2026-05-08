import asyncio
import sys
import os
from pathlib import Path
from collections import defaultdict

# Add backend to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

from app.db.session import SessionLocal
from app.models.image import Image
from app.models.set import Set
from sqlalchemy import select
from sqlalchemy.orm import selectinload

async def find_duplicates(dry_run=True, delete_loose=False):
    """
    Finds and optionally resolves duplicate images based on pHash.
    """
    async with SessionLocal() as db:
        print("Loading all images and pHashes...")
        result = await db.execute(
            select(Image)
            .filter(Image.phash != None)
            .options(selectinload(Image.set).selectinload(Set.creators))
        )
        images = result.scalars().all()
        print(f"Indexed {len(images)} images.")

        # Group by pHash
        phash_map = defaultdict(list)
        for img in images:
            phash_map[img.phash].append(img)

        # Filter for actual duplicates
        duplicates = {h: imgs for h, imgs in phash_map.items() if len(imgs) > 1}
        
        if not duplicates:
            print("No duplicates found!")
            return

        print(f"\nFound {len(duplicates)} groups of duplicate images (Total {sum(len(v) for v in duplicates.values())} files).")
        
        stats = {
            "resolved": 0,
            "space_saved": 0,
            "errors": 0
        }

        for phash, img_list in duplicates.items():
            print(f"\n[Duplicate Group: {phash}]")
            
            # Sort: Keep the one in a "real" set, prefer shortest path or highest resolution
            # Criteria for 'original':
            # 1. Not in 'Needs Organizing'
            # 2. Highest resolution (width * height)
            # 3. Oldest ID (likely the first one imported)
            
            def score_img(img):
                score = 0
                if "Needs Organizing" not in (img.set.creators[0].canonical_name if img.set.creators else ""):
                    score += 1000
                score += (img.width * img.height) / 1000000 # Add resolution weight
                return score

            sorted_imgs = sorted(img_list, key=score_img, reverse=True)
            original = sorted_imgs[0]
            redundant = sorted_imgs[1:]

            orig_creator = original.set.creators[0].canonical_name if original.set.creators else "Unknown"
            print(f"  KEEP Original: ID {original.id} | {orig_creator} - {original.set.title} | {original.filename} ({original.width}x{original.height})")
            
            for img in redundant:
                red_creator = img.set.creators[0].canonical_name if img.set.creators else "Unknown"
                print(f"  REMOVE Redundant: ID {img.id} | {red_creator} - {img.set.title} | {img.filename}")
                
                if not dry_run:
                    try:
                        p = Path(img.local_path)
                        if p.exists():
                            stats["space_saved"] += p.stat().st_size
                            p.unlink()
                        
                        # Remove from DB
                        await db.delete(img)
                        stats["resolved"] += 1
                    except Exception as e:
                        print(f"    ! Error resolving duplicate {img.id}: {e}")
                        stats["errors"] += 1

        if not dry_run:
            await db.commit()
            print(f"\nResolution Complete.")
            print(f"- Duplicates Removed: {stats['resolved']}")
            print(f"- Space Saved: {stats['space_saved'] / 1024 / 1024:.2f} MB")
            if stats["errors"]:
                print(f"- Errors: {stats['errors']}")
        else:
            potential_savings = sum(Path(img.local_path).stat().st_size for h, imgs in duplicates.items() for img in imgs[1:] if Path(img.local_path).exists())
            print(f"\n[DRY RUN] Would remove {sum(len(v)-1 for v in duplicates.values())} redundant files.")
            print(f"[DRY RUN] Potential space savings: {potential_savings / 1024 / 1024:.2f} MB")
            print("Run with --run to actually delete duplicates.")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Find and remove duplicate images based on pHash.")
    parser.add_argument("--run", action="store_true", help="Actually delete duplicate files and DB records.")
    args = parser.parse_args()
    
    asyncio.run(find_duplicates(dry_run=not args.run))
