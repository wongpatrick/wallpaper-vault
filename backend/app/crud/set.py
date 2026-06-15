"""
CRUD operations and business logic for managing wallpaper sets and bulk imports.
"""
from typing import Optional
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.models.creator import Creator
from app.models.set import Set
from app.models.image import Image
from app.models.character import Character
from app.models.franchise import Franchise
from app.models.tag import Tag
from app.schemas.set import (
    SetCreate, 
    SetUpdate,
    BatchImportRequest, 
    BatchImportResponse,
    SetBulkUpdate
)
from app.core.enums import BulkOperationMode, TaskStatus
from app.crud.settings import get_setting
from app.core import tasks
from app.db.session import SessionLocal
from pathlib import Path
import structlog

logger = structlog.get_logger(__name__)

async def get_set(db: AsyncSession, set_id: int) -> Optional[Set]:
    """Retrieves a specific set by its ID, including creators and images.

    Args:
        db: Database session.
        set_id: ID of the set.

    Returns:
        The Set object if found, otherwise None.
    """
    result = await db.execute(
        select(Set).options(
            selectinload(Set.creators),
            selectinload(Set.images).selectinload(Image.tags),
            selectinload(Set.tags),
            selectinload(Set.characters)
        ).filter(Set.id == set_id)
    )
    return result.scalar_one_or_none()


async def get_sets(db: AsyncSession, skip: int = 0, limit: int = 100, search: Optional[str] = None, creator_type: Optional[str] = None, sort_by: Optional[str] = "id", sort_dir: Optional[str] = "desc", tag: Optional[str] = None, character: Optional[list[str]] = None, franchise: Optional[list[str]] = None) -> tuple[list[Set], int]:
    """Retrieves a paginated list of sets, with optional filtering.

    Args:
        db: Database session.
        skip: Number of records to skip.
        limit: Maximum number of records to return.
        search: Optional search term matching title or creator names.
        creator_type: Optional creator type filter.

    Returns:
        A tuple containing a list of Set objects and the total match count.
    """
    # Base query for sets
    query = select(Set)
    
    # Joins for filtering if needed
    if tag or search or character or franchise or creator_type:
        query = query.outerjoin(Set.creators).outerjoin(Set.tags).outerjoin(Set.characters).outerjoin(Character.franchise)
    
    # Apply filters
    if creator_type:
        query = query.filter(Creator.type == creator_type)
    if tag:
        query = query.filter(Set.tags.any(Tag.name.icontains(tag)))
    if character:
        query = query.filter(Set.characters.any(Character.name.in_(character)))
    if franchise:
        query = query.filter(Set.characters.any(Character.franchise.has(Franchise.name.in_(franchise))))
    if search:
        query = query.filter(
            or_(
                Set.title.icontains(search),
                Set.tags.any(Tag.name.icontains(search)),
                Creator.canonical_name.icontains(search),
                Character.name.icontains(search),
                Franchise.name.icontains(search)
            )
        )
    
    # Total count for filtered results
    count_query = select(func.count()).select_from(query.distinct().subquery())
    count_result = await db.execute(count_query)
    total = count_result.scalar_one()

    # Sorting logic
    if sort_by == "title":
        order_col = func.lower(Set.title)
    elif sort_by == "image_count":
        # Subquery to count images for each set
        subq = select(func.count(Image.id)).where(Image.set_id == Set.id).scalar_subquery()
        order_col = subq
    else:
        order_col = Set.date_added
        
    if sort_dir == "asc":
        order_expr = order_col.asc()
    else:
        order_expr = order_col.desc()

    # Final paginated query with relationship loading
    # We use distinct() because the join might create multiple rows per set
    sets_query = query.distinct().options(
        selectinload(Set.creators),
        selectinload(Set.images),
        selectinload(Set.tags),
        selectinload(Set.characters)
    ).order_by(order_expr, Set.id.desc()).offset(skip).limit(limit)
    
    result = await db.execute(sets_query)
    return list(result.scalars().all()), total

async def create_set(db: AsyncSession, set_in: SetCreate) -> Set:
    """Creates a new Set record and associates requested creators and images.

    Args:
        db: Database session.
        set_in: The creation schema containing set details.

    Returns:
        The newly created Set object.
    """
    data = set_in.model_dump(exclude={"creator_ids", "images", "tags", "characters"})
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
        
    if set_in.tags:
        from app.crud.tag import get_tags_by_names
        db_set.tags = await get_tags_by_names(db, set_in.tags)

    if set_in.characters:
        from app.crud.character import get_characters_by_names
        db_set.characters = await get_characters_by_names(db, set_in.characters)
    
    if set_in.images:
        # File sizing and CV2 processing has been moved to services/set_service.py
        new_images = [Image(**image_in.model_dump()) for image_in in set_in.images]
        db_set.images = new_images

    db.add(db_set)
    await db.commit()
    await db.refresh(db_set)
    query = (
        select(Set)
        .options(
            selectinload(Set.creators),
            selectinload(Set.images),
            selectinload(Set.tags),
            selectinload(Set.characters)
        )
        .filter(Set.id == db_set.id)
    )
    result = await db.execute(query)
    return result.scalar_one()

async def get_set_by_title_and_creator(db: AsyncSession, title: str, creator_id: int) -> Optional[Set]:
    """Checks if a set already exists with a specific title for a given creator.

    Args:
        db: Database session.
        title: Title of the set.
        creator_id: ID of the creator.

    Returns:
        The matching Set object, or None if not found.
    """
    result = await db.execute(
        select(Set)
        .join(Set.creators)
        .filter(Set.title == title)
        .filter(Creator.id == creator_id)
    )
    return result.scalar_one_or_none()



async def delete_set(db: AsyncSession, set_id: int) -> Optional[Set]:
    """Deletes a set record from the database.

    Args:
        db: Database session.
        set_id: ID of the set to delete.

    Returns:
        The deleted Set object, or None if not found.
    """
    db_set = await get_set(db, set_id)
    if db_set:
        await db.delete(db_set)
        await db.commit()
    return db_set


async def update_set(db: AsyncSession, set_id: int, set_in: SetUpdate) -> Optional[Set]:
    """Updates an existing set and manages physical folder renaming.

    Args:
        db: Database session.
        set_id: ID of the set to update.
        set_in: The set update schema with modified data.

    Returns:
        The updated Set object, or None if not found.
    """
    db_set = await get_set(db, set_id)
    if not db_set:
        return None
    
    update_data = set_in.model_dump(exclude_unset=True, exclude={"creator_ids", "tags", "characters"})
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

    if set_in.tags is not None:
        from app.crud.tag import get_tags_by_names
        db_set.tags = await get_tags_by_names(db, set_in.tags)
        
    if set_in.characters is not None:
        from app.crud.character import get_characters_by_names
        db_set.characters = await get_characters_by_names(db, set_in.characters)
    
    # Note: Automatic Folder Renaming Logic was moved to services/set_service.py
    
    db.add(db_set)
    await db.commit()
    await db.refresh(db_set)
    
    # Re-fetch with relationships
    return await get_set(db, set_id)


async def bulk_update_sets(db: AsyncSession, bulk_in: SetBulkUpdate) -> int:
    """Performs bulk updates on multiple sets.

    Handles appending, removing, or replacing tags and creators across sets,
    and ensures folder renaming logic fires where applicable.

    Args:
        db: Database session.
        bulk_in: Schema containing the sets to update and the modifications.

    Returns:
        The number of sets successfully updated.
    """
    # 1. Fetch all target sets with creators, images, and tags
    result = await db.execute(
        select(Set).options(
            selectinload(Set.creators), 
            selectinload(Set.images),
            selectinload(Set.tags),
            selectinload(Set.characters)
        ).where(Set.id.in_(bulk_in.set_ids))
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
        
    # 3. Get Tags if tags provided
    target_tags = []
    if bulk_in.update_data.tags is not None:
        from app.crud.tag import get_tags_by_names
        target_tags = await get_tags_by_names(db, bulk_in.update_data.tags)

    # 3.5. Get Characters if provided
    target_characters = []
    if bulk_in.update_data.characters is not None:
        from app.crud.character import get_characters_by_names
        target_characters = await get_characters_by_names(db, bulk_in.update_data.characters)

    # 4. Apply updates
    update_fields = bulk_in.update_data.model_dump(exclude_unset=True, exclude={"creator_ids", "tags", "characters"})
    
    for db_set in db_sets:
        # Standard fields (notes, title, etc)
        for field in update_fields:
            if bulk_in.operation_mode == BulkOperationMode.APPEND and field == "notes":
                current_notes = db_set.notes or ""
                new_notes = update_fields[field] or ""
                db_set.notes = f"{current_notes}\n{new_notes}".strip() if current_notes else new_notes
            elif bulk_in.operation_mode == BulkOperationMode.REMOVE and field == "notes":
                db_set.notes = None
            else:
                setattr(db_set, field, update_fields[field])
                
        # Tags logic
        if bulk_in.update_data.tags is not None:
            if bulk_in.operation_mode == BulkOperationMode.APPEND:
                current_ids = {t.id for t in db_set.tags}
                to_add = [t for t in target_tags if t.id not in current_ids]
                db_set.tags.extend(to_add)
            elif bulk_in.operation_mode == BulkOperationMode.REMOVE:
                remove_ids = {t.id for t in target_tags}
                db_set.tags = [t for t in db_set.tags if t.id not in remove_ids]
            else:
                db_set.tags = list(target_tags)

        # Characters logic
        if bulk_in.update_data.characters is not None:
            if bulk_in.operation_mode == BulkOperationMode.APPEND:
                current_ids = {c.id for c in db_set.characters}
                to_add = [c for c in target_characters if c.id not in current_ids]
                db_set.characters.extend(to_add)
            elif bulk_in.operation_mode == BulkOperationMode.REMOVE:
                remove_ids = {c.id for c in target_characters}
                db_set.characters = [c for c in db_set.characters if c.id not in remove_ids]
            else:
                db_set.characters = list(target_characters)
        
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
                db_set.creators = list(target_creators)
        
        # Note: Automatic Folder Renaming Logic was moved to services/set_service.py
        
        db.add(db_set)

    await db.commit()
    return len(db_sets)





async def bulk_delete_sets(db: AsyncSession, set_ids: list[int]) -> int:
    """Deletes multiple sets from the database.

    Args:
        db: Database session.
        set_ids: List of set IDs to delete.

    Returns:
        The number of sets successfully deleted.
    """
    result = await db.execute(
        select(Set).where(Set.id.in_(set_ids))
    )
    db_sets = result.scalars().all()
    for db_set in db_sets:
        await db.delete(db_set)
    await db.commit()
    return len(db_sets)





async def batch_import_sets(db: AsyncSession, batch_in: BatchImportRequest, task_id: str = None) -> BatchImportResponse:
    """Executes a batch import process for multiple folders.

    Parses candidate folders, validates them, and optionally imports and crops
    images to the vault location.

    Args:
        db: Database session.
        batch_in: Request payload detailing paths and import behaviors.
        task_id: Optional ID for progress tracking.

    Returns:
        A response object detailing the success/failure of each imported item.
    """
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
    
    def parse_ratio(r_str: str, default: float) -> float:
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

async def run_batch_import_background(batch_in: BatchImportRequest, task_id: str) -> None:
    """Entry point for running batch imports as a background task.

    Manages its own database session and updates the task status upon
    completion or error.

    Args:
        batch_in: Request payload for the batch import.
        task_id: The ID of the task to update.
    """
    async with SessionLocal() as db:
        try:
            await tasks.update_task(db, task_id, status=TaskStatus.PROCESSING)
            await batch_import_sets(db, batch_in, task_id=task_id)
            await tasks.update_task(db, task_id, status=TaskStatus.COMPLETED)
        except Exception as e:
            import traceback
            traceback.print_exc()
            await tasks.update_task(db, task_id, status=TaskStatus.ERROR, error_message=str(e))
