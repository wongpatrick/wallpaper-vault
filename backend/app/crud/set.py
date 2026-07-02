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


async def recalculate_set_rollup_tags(db: AsyncSession, set_id: int) -> None:
    """Recalculates the rollup tags for a set based on image tags and rollup threshold."""
    result = await db.execute(
        select(Set).options(
            selectinload(Set.images).selectinload(Image.tags),
            selectinload(Set.tags)
        ).filter(Set.id == set_id)
    )
    db_set = result.scalar_one_or_none()
    if not db_set:
        return
    
    rollup_threshold_setting = await get_setting(db, "ai_rollup_threshold")
    if rollup_threshold_setting and rollup_threshold_setting.value:
        try:
            rollup_threshold = float(rollup_threshold_setting.value)
        except ValueError:
            rollup_threshold = 0.3
    else:
        rollup_threshold = 0.3

    if db_set.images:
        tag_counts = {}
        tag_objects = {}
        for img in db_set.images:
            for t in img.tags:
                tag_counts[t.name] = tag_counts.get(t.name, 0) + 1
                tag_objects[t.name] = t

        rollup_tags = []
        num_images = len(db_set.images)
        for tag_name, count in tag_counts.items():
            freq = float(count) / num_images
            if freq >= rollup_threshold:
                rollup_tags.append(tag_objects[tag_name])
        
        db_set.tags = rollup_tags
    else:
        db_set.tags = []
        
    db.add(db_set)
    await db.commit()


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
        image_ids = [img.id for img in db_set.images]
        local_path_str = db_set.local_path
        await db.delete(db_set)
        await db.flush()
        
        if local_path_str:
            import shutil
            local_path = Path(local_path_str)
            if local_path.exists() and local_path.is_dir():
                try:
                    shutil.rmtree(local_path)
                except PermissionError as e:
                    await db.rollback()
                    logger.warning("Failed to delete set folder due to PermissionError, rolling back", path=local_path_str)
                    raise e
                except Exception as e:
                    await db.rollback()
                    logger.error("Failed to delete set folder, rolling back", path=local_path_str, error=str(e))
                    raise e
                    
        await db.commit()
        
        # Invalidate thumbnail cache for deleted images
        from app.services.image_service import delete_image_thumbnails
        for img_id in image_ids:
            delete_image_thumbnails(img_id)
            
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
        select(Set).options(selectinload(Set.images)).where(Set.id.in_(set_ids))
    )
    db_sets = result.scalars().all()
    
    all_image_ids = []
    folders_to_delete = []
    
    for db_set in db_sets:
        all_image_ids.extend([img.id for img in db_set.images])
        if db_set.local_path:
            folders_to_delete.append(db_set.local_path)
        await db.delete(db_set)
        
    await db.flush()
    
    import shutil
    for folder_str in folders_to_delete:
        folder_path = Path(folder_str)
        if folder_path.exists() and folder_path.is_dir():
            try:
                shutil.rmtree(folder_path)
            except PermissionError as e:
                await db.rollback()
                logger.warning("Failed to delete set folder in bulk delete due to PermissionError, rolling back", path=folder_str)
                raise e
            except Exception as e:
                await db.rollback()
                logger.error("Failed to delete set folder in bulk delete, rolling back", path=folder_str, error=str(e))
                raise e
                
    await db.commit()
    
    # Invalidate thumbnail cache for all deleted images
    from app.services.image_service import delete_image_thumbnails
    for img_id in all_image_ids:
        delete_image_thumbnails(img_id)
                    
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
    
    # Pre-scan for Total Images across valid folders
    from app.core.crop import collect_image_paths
    total_images = 0
    for item in results:
        if item.is_valid:
            try:
                img_paths = collect_image_paths(item.source_path, recursive=True)
                total_images += len(img_paths)
            except Exception as e:
                logger.error("Failed to collect image paths during pre-scan", path=item.source_path, error=str(e))
                
    progress_state = {"processed": 0, "total": total_images}
    if task_id:
        await tasks.update_task(db, task_id, progress=0, total=total_images)
        
    final_results = []
    for item in results:
        processed_item = await import_service.execute_import_item(
            db=db,
            item=item,
            vault_root=vault_root,
            h_ratio=h_ratio,
            v_ratio=v_ratio,
            h_label=h_label,
            v_label=v_label,
            delete_source_default=batch_in.delete_source_default,
            task_id=task_id,
            progress_state=progress_state
        )
        final_results.append(processed_item)

    # Check for source directories that weren't fully cleaned up
    cleanup_warnings = []
    if batch_in.delete_source_default:
        from app.services.import_service import delete_dir_if_empty
        for item in batch_in.items:
            source_p = Path(item.source_path)
            if source_p.exists() and source_p.is_dir():
                try:
                    if delete_dir_if_empty(source_p):
                        logger.info("Deleted empty batch source directory", path=item.source_path)
                    else:
                        cleanup_warnings.append(source_p.name)
                        logger.info("Batch source directory not empty, leaving on disk", path=item.source_path)
                except Exception as err:
                    logger.error("Failed to delete empty batch source directory", path=item.source_path, error=str(err))

    await db.commit()
    if task_id:
        await tasks.update_task(db, task_id, progress=progress_state["processed"], total=total_images)
    
    response = BatchImportResponse(items=final_results)
    response.cleanup_warnings = cleanup_warnings  # Attach warnings for caller
    return response

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
            response = await batch_import_sets(db, batch_in, task_id=task_id)
            
            warning_msg = None
            warnings = getattr(response, 'cleanup_warnings', [])
            if warnings:
                folders_str = ", ".join(f"'{f}'" for f in warnings)
                warning_msg = f"Source folder(s) {folders_str} still contained files and were left on disk."
            
            await tasks.update_task(db, task_id, status=TaskStatus.COMPLETED, error_message=warning_msg)
        except Exception as e:
            import traceback
            traceback.print_exc()
            await tasks.update_task(db, task_id, status=TaskStatus.ERROR, error_message=str(e))
