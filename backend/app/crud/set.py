from typing import Optional
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.creator import Creator
from app.models.set import Set
from app.models.image import Image
from app.schemas.set import (
    SetCreate, 
    SetImport, 
    SetUpdate,
    BatchImportRequest, 
    BatchImportResponse
)
from app.crud.creator import get_creator_by_name, create_creator
from app.schemas.creator import CreatorCreate
from app.crud.settings import get_setting
from app.core import tasks
from app.db.session import SessionLocal
from pathlib import Path

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
        .order_by(Set.date_added.desc())
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
    db_set = await get_set(db, set_id)
    if db_set:
        await db.delete(db_set)
        await db.commit()
    return db_set


async def update_set(db: AsyncSession, set_id: int, set_in: SetUpdate) -> Optional[Set]:
    db_set = await get_set(db, set_id)
    if not db_set:
        return None
    
    update_data = set_in.model_dump(exclude_unset=True)
    for field in update_data:
        setattr(db_set, field, update_data[field])
    
    db.add(db_set)
    await db.commit()
    await db.refresh(db_set)
    
    # Re-fetch with relationships
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
