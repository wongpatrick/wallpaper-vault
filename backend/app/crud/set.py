from typing import Optional
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.creator import Creator
from app.models.set import Set
from app.models.image import Image
from app.schemas.set import (
    SetCreate, 
    SetImport, 
    SetUpdate,
    BatchImportRequest, 
    BatchImportResponse,
    SetBulkUpdate,
    BulkOperationMode,
    SetMerge
)
from app.crud.creator import get_creator_by_name, create_creator
from app.schemas.creator import CreatorCreate
from app.crud.settings import get_setting
from app.core import tasks
from app.db.session import SessionLocal
from pathlib import Path
import re

def sanitize_folder_name(name: str) -> str:
    # Remove invalid characters: \ / : * ? " < > |
    return re.sub(r'[\\/:*?"<>|]', '', name).strip()

def rename_set_folder_if_needed(db_set: Set):
    if not db_set.local_path:
        return
        
    # Generate new folder name based on convention: [Creators] - [Sanitized Title]
    creator_names = [c.canonical_name for c in db_set.creators]
    creators_str = " & ".join(creator_names) if creator_names else "Unknown"
    sanitized_title = sanitize_folder_name(db_set.title) if db_set.title else "Untitled"
    new_folder_name = f"{creators_str} - {sanitized_title}"
    
    old_path = Path(db_set.local_path)
    if old_path.exists() and old_path.is_dir():
        new_path = old_path.with_name(new_folder_name)
        
        # Perform rename if necessary and new path doesn't already exist
        if new_path != old_path and not new_path.exists():
            try:
                old_path.rename(new_path)
                db_set.local_path = str(new_path)
                
                # Update paths for all images within the set
                if db_set.images:
                    for img in db_set.images:
                        img_old_path = Path(img.local_path)
                        img_new_path = new_path / img_old_path.name
                        img.local_path = str(img_new_path)
            except Exception as e:
                print(f"Error renaming set folder: {e}")
                # We don't raise here to prevent blocking the metadata update if FS fails

async def get_set(db: AsyncSession, set_id: int):
    result = await db.execute(
        select(Set).options(
            selectinload(Set.creators),
            selectinload(Set.images)
        ).filter(Set.id == set_id)
    )
    return result.scalar_one_or_none()


async def get_sets(db: AsyncSession, skip: int = 0, limit: int = 100, search: Optional[str] = None, creator_type: Optional[str] = None):
    # Base query for sets
    query = select(Set)
    
    # Joins for filtering if needed
    if search or creator_type:
        query = query.join(Set.creators)
    
    # Apply filters
    if creator_type:
        query = query.filter(Creator.type == creator_type)
    if search:
        query = query.filter(
            (Set.title.icontains(search)) | 
            (Creator.canonical_name.icontains(search))
        )
    
    # Total count for filtered results
    count_query = select(func.count()).select_from(query.distinct().subquery())
    count_result = await db.execute(count_query)
    total = count_result.scalar_one()

    # Final paginated query with relationship loading
    # We use distinct() because the join might create multiple rows per set
    sets_query = query.distinct().options(
        selectinload(Set.creators),
        selectinload(Set.images)
    ).order_by(Set.date_added.desc(), Set.id.desc()).offset(skip).limit(limit)
    
    result = await db.execute(sets_query)
    return list(result.scalars().all()), total

async def create_set(db: AsyncSession, set_in: SetCreate) -> Set:
    data = set_in.model_dump(exclude={"creator_ids", "images"})
    # Normalize empty source_url to None to avoid UNIQUE constraint issues in SQLite
    if data.get("source_url") == "":
        data["source_url"] = None
        
    db_set = Set(**data)

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
    db_set = await get_set(db, set_id)
    if db_set:
        await db.delete(db_set)
        await db.commit()
    return db_set


async def update_set(db: AsyncSession, set_id: int, set_in: SetUpdate) -> Optional[Set]:
    db_set = await get_set(db, set_id)
    if not db_set:
        return None
    
    update_data = set_in.model_dump(exclude_unset=True, exclude={"creator_ids"})
    # Normalize empty source_url to None to avoid UNIQUE constraint issues in SQLite
    if "source_url" in update_data and update_data["source_url"] == "":
        update_data["source_url"] = None
        
    for field in update_data:
        setattr(db_set, field, update_data[field])
    
    if set_in.creator_ids is not None:
        result = await db.execute(
            select(Creator).where(Creator.id.in_(set_in.creator_ids))
        )
        creators = result.scalars().all()
        db_set.creators = list(creators)
    
    # Automatic Folder Renaming Logic
    rename_set_folder_if_needed(db_set)
    
    db.add(db_set)
    await db.commit()
    await db.refresh(db_set)
    
    # Re-fetch with relationships
    return await get_set(db, set_id)


async def bulk_update_sets(db: AsyncSession, bulk_in: SetBulkUpdate) -> int:
    # 1. Fetch all target sets with creators and images
    result = await db.execute(
        select(Set).options(selectinload(Set.creators), selectinload(Set.images)).where(Set.id.in_(bulk_in.set_ids))
    )
    db_sets = result.scalars().all()
    
    if not db_sets:
        return 0
    
    # 2. Get Creators if creator_ids provided
    target_creators = []
    if bulk_in.update_data.creator_ids is not None:
        c_result = await db.execute(
            select(Creator).where(Creator.id.in_(bulk_in.update_data.creator_ids))
        )
        target_creators = c_result.scalars().all()

    # 3. Apply updates
    update_fields = bulk_in.update_data.model_dump(exclude_unset=True, exclude={"creator_ids"})
    
    for db_set in db_sets:
        # Standard fields
        for field in update_fields:
            if bulk_in.operation_mode == BulkOperationMode.APPEND and field == "tags":
                current_tags = (db_set.tags or "").split()
                new_tags = (update_fields[field] or "").split()
                # Use a set to avoid duplicates
                combined = sorted(list(set(current_tags + new_tags)))
                db_set.tags = " ".join(combined) if combined else None
            elif bulk_in.operation_mode == BulkOperationMode.REMOVE and field == "tags":
                current_tags = (db_set.tags or "").split()
                tags_to_remove = (update_fields[field] or "").split()
                remaining = [t for t in current_tags if t not in tags_to_remove]
                db_set.tags = " ".join(remaining) if remaining else None
            else:
                # REPLACE mode (default for other fields or if explicitly set)
                setattr(db_set, field, update_fields[field])
        
        # Creator logic
        if bulk_in.update_data.creator_ids is not None:
            if bulk_in.operation_mode == BulkOperationMode.APPEND:
                current_ids = {c.id for c in db_set.creators}
                to_add = [c for c in target_creators if c.id not in current_ids]
                db_set.creators.extend(to_add)
            elif bulk_in.operation_mode == BulkOperationMode.REMOVE:
                remove_ids = {c.id for c in target_creators}
                db_set.creators = [c for c in db_set.creators if c.id not in remove_ids]
            else:
                # REPLACE
                db_set.creators = list(target_creators)
        
        # Automatic Folder Renaming Logic
        rename_set_folder_if_needed(db_set)
        
        db.add(db_set)

    await db.commit()
    return len(db_sets)


async def merge_sets(db: AsyncSession, source_ids: list[int], target_id: int) -> Optional[Set]:
    import shutil
    from pathlib import Path

    # 1. Fetch target set
    target_set = await get_set(db, target_id)
    if not target_set:
        return None
    
    target_path = Path(target_set.local_path) if target_set.local_path else None
    
    # 2. Iterate through source sets
    for sid in source_ids:
        if sid == target_id:
            continue
        
        source_set = await get_set(db, sid)
        if not source_set:
            continue
        
        # Move images physically and update paths
        if target_path:
            for img in source_set.images:
                old_p = Path(img.local_path) if img.local_path else None
                if not old_p:
                    continue
                
                new_p = target_path / old_p.name
                
                # Case 1: File is at the source location - Move it to target
                if old_p.exists() and old_p.parent != target_path:
                    # Handle collisions
                    counter = 1
                    actual_new_p = new_p
                    while actual_new_p.exists():
                        actual_new_p = target_path / f"{old_p.stem}_{counter}{old_p.suffix}"
                        counter += 1
                    
                    try:
                        shutil.move(str(old_p), str(actual_new_p))
                        img.local_path = str(actual_new_p)
                    except Exception as e:
                        print(f"Error moving image {old_p}: {e}")
                
                # Case 2: File was already moved to target manually (or by partial merge)
                elif new_p.exists():
                    img.local_path = str(new_p)

        # Re-associate images properly to avoid cascade-delete-orphan
        images_to_move = list(source_set.images)
        source_set.images = [] 
        for img in images_to_move:
            img.set_id = target_id
            target_set.images.append(img)
            
        # Re-associate creators
        for c in source_set.creators:
            if c not in target_set.creators:
                target_set.creators.append(c)
                
        # Merge tags and notes
        if source_set.tags:
            current_tags = set((target_set.tags or "").split())
            new_tags = set(source_set.tags.split())
            combined = sorted(list(current_tags | new_tags))
            target_set.tags = " ".join(combined) if combined else None
            
        if source_set.notes:
            target_set.notes = (target_set.notes or "") + "\n" + source_set.notes
            target_set.notes = target_set.notes.strip()
            
        # Delete source set
        await db.delete(source_set)
        
    await db.commit()
    await db.refresh(target_set)
    
    # Optional: trigger renaming if title/creators changed
    rename_set_folder_if_needed(target_set)
    
    return await get_set(db, target_id)


async def bulk_delete_sets(db: AsyncSession, set_ids: list[int]) -> int:
    result = await db.execute(
        select(Set).where(Set.id.in_(set_ids))
    )
    db_sets = result.scalars().all()
    for db_set in db_sets:
        await db.delete(db_set)
    await db.commit()
    return len(db_sets)


async def resync_set(db: AsyncSession, set_id: int) -> Optional[Set]:
    from app.services.audit_service import calculate_phash
    
    db_set = await get_set(db, set_id)
    if not db_set or not db_set.local_path:
        return None
    
    folder_path = Path(db_set.local_path)
    if not folder_path.exists() or not folder_path.is_dir():
        return None
    
    image_exts = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff'}
    
    # 1. Scan Disk
    disk_files = {} # path -> phash (deferred)
    for file in folder_path.iterdir():
        if file.is_file() and file.suffix.lower() in image_exts:
            disk_files[str(file)] = None

    # 2. Scan DB
    db_images = {img.local_path: img for img in db_set.images if img.local_path}
    
    # 3. Identify Untracked and Missing
    untracked_paths = [p for p in disk_files if p not in db_images]
    missing_records = [img for p, img in db_images.items() if not Path(p).exists()]
    
    # 4. Recovery Phase (Phash Matching)
    if untracked_paths and missing_records:
        # Build ghost map by phash
        ghost_map = {}
        for ghost in missing_records:
            if ghost.phash:
                if ghost.phash not in ghost_map:
                    ghost_map[ghost.phash] = []
                ghost_map[ghost.phash].append(ghost)
        
        recovered_paths = set()
        recovered_records = set()
        
        for path_str in untracked_paths:
            ph = calculate_phash(Path(path_str))
            if ph and ph in ghost_map:
                # Find a matching ghost that hasn't been recovered yet
                possible_ghosts = [g for g in ghost_map[ph] if g not in recovered_records]
                if possible_ghosts:
                    ghost = possible_ghosts[0]
                    ghost.local_path = path_str
                    recovered_paths.add(path_str)
                    recovered_records.add(ghost)
        
        # Cleanup processed items
        untracked_paths = [p for p in untracked_paths if p not in recovered_paths]
        missing_records = [g for g in missing_records if g not in recovered_records]

    # 5. Finalize - Add New
    for path_str in untracked_paths:
        p = Path(path_str)
        ph = calculate_phash(p)
        new_img = Image(
            set_id=set_id,
            filename=p.name,
            local_path=path_str,
            phash=ph
        )
        db.add(new_img)
        
    # 6. Finalize - Remove remaining missing
    for ghost in missing_records:
        await db.delete(ghost)
        
    await db.commit()
    await db.refresh(db_set)
    return await get_set(db, set_id)


async def batch_import_sets(db: AsyncSession, batch_in: BatchImportRequest, task_id: str = None) -> BatchImportResponse:
    from app.services import import_service
    # 1. Gather
    candidates = await import_service.gather_candidates(db, batch_in)
    
    # 2. Parse & Validate
    regex = import_service.compile_parsing_regex(batch_in.parsing_template)
    results = await import_service.parse_and_validate_candidates(db, candidates, regex)

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
        except (ValueError, TypeError):
            return default

    h_ratio = parse_ratio(h_label_raw, 16.0/9.0)
    v_ratio = parse_ratio(v_label_raw, 9.0/16.0)
    
    h_label = h_label_raw.replace("/", "x")
    v_label = v_label_raw.replace("/", "x")
    
    final_results = []
    total_items = len(results)
    for idx, item in enumerate(results):
        if task_id:
            await tasks.update_task(db, task_id, progress=idx, total=total_items)
            
        processed_item = await import_service.execute_import_item(
            db=db,
            item=item,
            vault_root=vault_root,
            h_ratio=h_ratio,
            v_ratio=v_ratio,
            h_label=h_label,
            v_label=v_label,
            delete_source_default=batch_in.delete_source_default
        )
        final_results.append(processed_item)

    await db.commit()
    if task_id:
        await tasks.update_task(db, task_id, progress=total_items, total=total_items)
    return BatchImportResponse(items=final_results)

async def run_batch_import_background(batch_in: BatchImportRequest, task_id: str):
    async with SessionLocal() as db:
        try:
            await tasks.update_task(db, task_id, status="processing")
            await batch_import_sets(db, batch_in, task_id=task_id)
            await tasks.update_task(db, task_id, status="completed")
        except Exception as e:
            import traceback
            traceback.print_exc()
            await tasks.update_task(db, task_id, status="error", error_message=str(e))
