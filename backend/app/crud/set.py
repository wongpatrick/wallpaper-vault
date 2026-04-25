from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.creator import Creator
from app.models.set import Set
from app.models.image import Image
from app.schemas.set import (
    SetCreate, 
    SetImport, 
    SetBatchImport, 
    BatchImportRequest, 
    BatchImportItem, 
    BatchImportResponse
)
from app.crud.creator import get_creator_by_name, create_creator
from app.schemas.creator import CreatorCreate
from app.core.crop import collect_image_paths, process_image
from app.crud.settings import get_setting
from app.core import tasks
import shutil
from pathlib import Path
import re


async def get_set(db: AsyncSession, set_id: int):
    result = await db.execute(
        select(Set).options(
            selectinload(Set.creators),
            selectinload(Set.images)
        ).filter(Set.id == set_id)
    )
    return result.scalar_one_or_none()


async def get_sets(db: AsyncSession, skip: int = 0, limit: int = 100):
    sets = await db.execute(
        select(Set)
        .options(
            selectinload(Set.creators),
            selectinload(Set.images)
        )
        .offset(skip)
        .limit(limit)
    )
    return list(sets.scalars().all())

async def create_set(db: AsyncSession, set_in: SetCreate) -> Set:
    db_set = Set(**set_in.model_dump(exclude={"creator_ids", "images"}))

    if set_in.creator_ids:
        result = await db.execute(
            select(Creator).where(Creator.id.in_(set_in.creator_ids))
        )
        creators = result.scalars().all()
        db_set.creators = list(creators)
    
    if set_in.images:
        db_set.images = [Image(**image.model_dump()) for image in set_in.images]

    db.add(db_set)
    await db.commit()
    await db.refresh(db_set)
    query = (
        select(Set)
        .options(
            selectinload(Set.creators),
            selectinload(Set.images)
        )
        .filter(Set.id == db_set.id)
    )
    result = await db.execute(query)
    return result.scalar_one()

async def get_set_by_title_and_creator(db: AsyncSession, title: str, creator_id: int):
    result = await db.execute(
        select(Set)
        .join(Set.creators)
        .filter(Set.title == title)
        .filter(Creator.id == creator_id)
    )
    return result.scalar_one_or_none()

async def import_set(db: AsyncSession, set_in: SetImport) -> Set:
    db_creators = []
    for name in set_in.creator_names:
        creator = await get_creator_by_name(db, name)
        if not creator:
            creator = await create_creator(db, CreatorCreate(canonical_name=name))
        
        existing_set = await get_set_by_title_and_creator(db, set_in.title, creator.id)
        if existing_set:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=400, 
                detail=f"Set '{set_in.title}' already exists for creator '{name}'"
            )
            
        db_creators.append(creator)
    
    db_set = Set(
        title=set_in.title,
        local_path=set_in.local_path,
        notes=set_in.notes
    )
    db_set.creators = db_creators

    if set_in.images:
        db_set.images = [Image(**image.model_dump()) for image in set_in.images]

    db.add(db_set)
    await db.commit()
    await db.refresh(db_set)
    
    query = (
        select(Set)
        .options(
            selectinload(Set.creators),
            selectinload(Set.images)
        )
        .filter(Set.id == db_set.id)
    )
    result = await db.execute(query)
    return result.scalar_one()

async def delete_set(db: AsyncSession, set_id: int):
    set = await get_set(db, set_id)
    await db.delete(set)
    await db.commit()
    return set


async def batch_import_sets(db: AsyncSession, batch_in: BatchImportRequest, task_id: str = None) -> BatchImportResponse:
    # 1. Gather candidate folders
    candidates = []
    if batch_in.scan_auto_path:
        parse_setting = await get_setting(db, "auto_parse_path")
        if parse_setting and parse_setting.value:
            scan_root = Path(parse_setting.value)
            if scan_root.exists() and scan_root.is_dir():
                for item in scan_root.iterdir():
                    if item.is_dir():
                        candidates.append({
                            "path": str(item.resolve()),
                            "name": item.name
                        })
    
    # Add manually provided items
    for item in batch_in.items:
        candidates.append({
            "path": item.source_path,
            "name": Path(item.source_path).name,
            "creator_name": item.creator_name,
            "set_title": item.set_title,
            "delete_source": item.delete_source,
            "auto_orient": item.auto_orient
        })

    # 2. Parse / Validate candidates
    results = []
    regex = None
    if batch_in.parsing_template:
        try:
            pt = batch_in.parsing_template
            # If user provides a raw regex with named groups, use it directly
            if "(?P<creator" in pt or "(?P<set" in pt:
                regex = re.compile(pt)
            else:
                # Support multiple [Creator] or [Set] tags by indexing them
                # e.g. [Creator] & [Creator] -> (?P<creator_0>.+?) & (?P<creator_1>.+?)
                pattern = re.escape(pt)
                
                # We need to replace occurrences one by one to give them unique group names
                for tag, group_prefix in [("\\[Creator\\]", "creator"), ("\\[Set\\]", "set")]:
                    count = 0
                    while tag in pattern:
                        pattern = pattern.replace(tag, f"(?P<{group_prefix}_{count}>.+?)", 1)
                        count += 1
                
                regex = re.compile(f"^{pattern}$")
        except Exception as e:
            print(f"Error compiling template: {e}")

    for cand in candidates:
        path = cand["path"]
        name = cand["name"]
        creator = cand.get("creator_name")
        title = cand.get("set_title")
        isValid = True
        
        if not creator or not title:
            if regex:
                m = regex.match(name)
                if m:
                    # Extract and join all indexed creator groups
                    c_parts = [v for k, v in m.groupdict().items() if k.startswith("creator_") and v]
                    if c_parts:
                        creator = creator or " & ".join([p.strip() for p in c_parts])
                    elif "creator" in m.groupdict(): # Fallback for raw regex
                        creator = creator or m.group("creator")
                        
                    # Extract and join all indexed set groups
                    s_parts = [v for k, v in m.groupdict().items() if k.startswith("set_") and v]
                    if s_parts:
                        title = title or " ".join([p.strip() for p in s_parts])
                    elif "set" in m.groupdict(): # Fallback for raw regex
                        title = title or m.group("set")
                else:
                    isValid = False
            else:
                isValid = False

        item_result = BatchImportItem(
            source_path=path,
            creator_name=creator or "Unknown",
            set_title=title or "Unknown",
            isValid=isValid,
            status="pending"
        )
        results.append(item_result)

    if batch_in.dry_run:
        return BatchImportResponse(items=results)

    # 3. Execution Phase
    # Get vault path
    vault_setting = await get_setting(db, "base_library_path")
    if not vault_setting or not vault_setting.value:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="base_library_path not configured")
    
    vault_root = Path(vault_setting.value)
    
    # Get target ratios from settings
    h_ratio_setting = await get_setting(db, "horizontal_target_ratio")
    v_ratio_setting = await get_setting(db, "vertical_target_ratio")
    
    h_label_raw = h_ratio_setting.value if h_ratio_setting else "16/9"
    v_label_raw = v_ratio_setting.value if v_ratio_setting else "9/16"
    
    def parse_ratio(r_str, default):
        try:
            if "/" in r_str:
                num, den = r_str.split("/")
                return float(num) / float(den)
            return float(r_str)
        except:
            return default

    h_ratio = parse_ratio(h_label_raw, 16.0/9.0)
    v_ratio = parse_ratio(v_label_raw, 9.0/16.0)
    
    # Clean labels for filename (e.g. 16/9 -> 16x9)
    h_label = h_label_raw.replace("/", "x")
    v_label = v_label_raw.replace("/", "x")
    
    import cv2
    final_results = []
    total_items = len(results)
    for idx, item in enumerate(results):
        if task_id:
            tasks.update_task(task_id, progress=idx, total=total_items)
            
        if not item.isValid:
            item.status = "error"
            item.error = "Invalid parsing"
            final_results.append(item)
            continue
            
        try:
            # 1. Handle Multiple Creators
            # Split ONLY on ' & ' with whitespace to be safe for names with special chars
            raw_names = re.split(r'\s+&\s+', item.creator_name)
            creator_names = [n.strip() for n in raw_names if n.strip()]
            if not creator_names:
                # Fallback to literal string if no ' & ' found
                creator_names = [item.creator_name.strip()] if item.creator_name.strip() else ["Unknown"]
            
            db_creators = []
            for name in creator_names:
                c = await get_creator_by_name(db, name)
                if not c:
                    c = await create_creator(db, CreatorCreate(canonical_name=name))
                db_creators.append(c)

            # Join back for folder name
            joined_creators = " & ".join([c.canonical_name for c in db_creators])
            
            # 2. Create destination: Vault / Creator & Creator - Set Title
            folder_name = f"{joined_creators} - {item.set_title}"
            dest_dir = vault_root / folder_name
            dest_dir.mkdir(parents=True, exist_ok=True)

            # 3. Existing Set Check (Check if title exists for any of the creators)
            is_duplicate = False
            for c in db_creators:
                existing = await get_set_by_title_and_creator(db, item.set_title, c.id)
                if existing:
                    is_duplicate = True
                    break
            
            if is_duplicate:
                item.status = "error"
                item.error = "Set already exists for one or more creators"
                final_results.append(item)
                continue

            # 4. Process Images
            image_paths = collect_image_paths(item.source_path, recursive=True)
            db_images = []
            for img_path in image_paths:
                p = Path(img_path)
                # We save directly to dest_dir (root)
                base_out = dest_dir / p.name
                
                # Pass ratios and labels to process_image
                ok, final_p_str = process_image(
                    img_path, 
                    str(base_out), 
                    auto_orient=True, 
                    sort_output=False,
                    horz_ar=h_ratio,
                    vert_ar=v_ratio,
                    horz_label=h_label,
                    vert_label=v_label
                )
                
                if ok:
                    final_p = Path(final_p_str)
                    img = cv2.imread(final_p_str)
                    if img is not None:
                        h, w = img.shape[:2]
                        
                        # Determine label based on final name prefix
                        ratio_label = h_label if final_p.name.startswith(f"{h_label}.") else v_label
                        
                        db_images.append(Image(
                            filename=final_p.name,
                            local_path=str(final_p.resolve()),
                            width=w, height=h,
                            file_size=final_p.stat().st_size,
                            aspect_ratio=float(w)/float(h) if h!=0 else 0,
                            aspect_ratio_label=ratio_label
                        ))
            
            # 5. Create Set
            db_set = Set(title=item.set_title, local_path=str(dest_dir.resolve()))
            db_set.creators = db_creators
            db_set.images = db_images
            db.add(db_set)
            
            # Cleanup
            # Note: We use delete_source_default or item level if we had it
            if batch_in.delete_source_default:
                source_p = Path(item.source_path)
                if source_p.is_dir(): shutil.rmtree(source_p)
                else: source_p.unlink()

            item.status = "success"
        except Exception as e:
            item.status = "error"
            item.error = str(e)
        
        final_results.append(item)

    await db.commit()
    if task_id:
        tasks.update_task(task_id, progress=total_items, total=total_items)
    return BatchImportResponse(items=final_results)


from app.db.session import SessionLocal

async def run_batch_import_background(batch_in: BatchImportRequest, task_id: str):
    async with SessionLocal() as db:
        try:
            tasks.update_task(task_id, status="processing")
            await batch_import_sets(db, batch_in, task_id=task_id)
            tasks.update_task(task_id, status="completed")
        except Exception as e:
            import traceback
            traceback.print_exc()
            tasks.update_task(task_id, status="error")