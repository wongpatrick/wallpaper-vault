"""
API endpoints for managing wallpaper sets, including creation, import, and bulk operations.
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status, Query
from fastapi.responses import StreamingResponse
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db

from app.crud import set as crud_set
from app.schemas.set import Set, SetCreate, SetImport, BatchImportRequest, BatchImportResponse, SetUpdate, SetPage, SetBulkUpdate, SetMerge
from app.core import tasks
from sqlalchemy.exc import IntegrityError
import structlog

logger = structlog.get_logger(__name__)


router = APIRouter()

@router.get("/events")
async def event_stream() -> StreamingResponse:
    return StreamingResponse(tasks.event_stream(), media_type="text/event-stream")

@router.post("/", response_model=Set)
async def create_set(
        set_in: SetCreate,
        db: AsyncSession = Depends(get_db)
) -> Set:
    from pathlib import Path
    from app.crud import settings as crud_settings
    
    # Auto-generate local_path if not provided
    if not set_in.local_path:
        base_path_setting = await crud_settings.get_setting(db, "base_library_path")
        if base_path_setting and base_path_setting.value:
            base_dir = Path(base_path_setting.value)
            
            # Retrieve creators to form folder name
            creator_names = []
            if set_in.creator_ids:
                from sqlalchemy import select
                from app.models.creator import Creator
                result = await db.execute(select(Creator).where(Creator.id.in_(set_in.creator_ids)))
                creators = result.scalars().all()
                creator_names = [c.canonical_name for c in creators]
                
            creators_str = " & ".join(creator_names) if creator_names else "Unknown"
            sanitized_title = crud_set.sanitize_folder_name(set_in.title) if set_in.title else "Untitled"
            new_folder_name = f"{creators_str} - {sanitized_title}"
            
            new_path = base_dir / new_folder_name
            try:
                new_path.mkdir(parents=True, exist_ok=True)
                set_in.local_path = str(new_path)
            except Exception as e:
                logger.error("Failed to create auto-generated set folder", path=str(new_path), error=str(e))
                # Proceed even if folder creation fails, though we may lack local_path

    try:
        db_set = await crud_set.create_set(db=db, set_in=set_in)
        logger.info("Created set", set_id=db_set.id, title=db_set.title)
        return db_set
    except IntegrityError as e:
        error_msg = str(e.orig)
        if "UNIQUE constraint failed" in error_msg:
            if "sets.source_url" in error_msg:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, 
                    detail=f"A set with the source URL '{set_in.source_url}' already exists!"
                )
        raise e

@router.post("/merge", response_model=Set)
async def merge_sets(
    merge_in: SetMerge,
    db: AsyncSession = Depends(get_db)
) -> Set:
    """
    Merge multiple source sets into a single target set.
    
    All images from the source sets will be reassigned to the target set. The source sets will then be permanently deleted. Use this to consolidate duplicate or fragmented collections.
    """
    if merge_in.target_id in merge_in.source_ids:
        raise HTTPException(status_code=400, detail="Cannot merge a set into itself")

    db_set = await crud_set.merge_sets(
        db, 
        source_ids=merge_in.source_ids, 
        target_id=merge_in.target_id
    )
    if db_set is None:
        raise HTTPException(status_code=404, detail="Target set not found")
    logger.info("Merged sets", source_ids=merge_in.source_ids, target_id=merge_in.target_id)
    return db_set

@router.post("/import", response_model=Set)
async def import_set(
        set_in: SetImport,
        db: AsyncSession = Depends(get_db)
) -> Set:
    db_set = await crud_set.import_set(db=db, set_in=set_in)
    logger.info("Imported set", set_id=db_set.id, title=db_set.title)
    return db_set

@router.post("/batch-import", response_model=BatchImportResponse)
async def batch_import_sets(
        batch_in: BatchImportRequest,
        background_tasks: BackgroundTasks,
        db: AsyncSession = Depends(get_db)
) -> BatchImportResponse:
    """
    Unified route to scan, parse, and optionally execute batch imports of directories.
    
    If `dry_run=True`, it only scans the provided paths, attempts to parse creator/set names using the `parsing_template`, and returns a preview of what would be imported. If `dry_run=False`, it launches the actual import process as an asynchronous background task.
    """
    if batch_in.dry_run:
        return await crud_set.batch_import_sets(db=db, batch_in=batch_in)
    
    # Background execution
    task_id = await tasks.create_task(db_session=db, status="accepted")
    background_tasks.add_task(crud_set.run_batch_import_background, batch_in, task_id)
    
    logger.info("Started batch import background task", task_id=task_id)
    return BatchImportResponse(
        items=[], 
        task_id=task_id, 
        status="accepted",
        summary={"message": "Batch import started in background"}
    )

@router.get("/", response_model=SetPage)
async def read_sets(
        skip: int = 0,
        limit: int = 100,
        search: Optional[str] = None,
        creator_type: Optional[str] = None,
        sort_by: Optional[str] = Query("date_added", description="Sort field (date_added, title, image_count)"),
        sort_dir: Optional[str] = Query("desc", description="Sort direction (asc, desc)"),
        db: AsyncSession = Depends(get_db)
) -> SetPage:
    sets, total = await crud_set.get_sets(db, skip=skip, limit=limit, search=search, creator_type=creator_type, sort_by=sort_by, sort_dir=sort_dir)
    return SetPage(items=sets, total=total, skip=skip, limit=limit)

@router.get("/{set_id}", response_model=Set)
async def read_set(
        set_id: int,
        db: AsyncSession = Depends(get_db)
) -> Set:
    db_set = await crud_set.get_set(db, set_id=set_id)
    if db_set is None:
        raise HTTPException(status_code=404, detail="Set not found")
    return db_set

@router.patch("/{set_id}", response_model=Set)
async def update_set(
        set_id: int,
        set_in: SetUpdate,
        db: AsyncSession = Depends(get_db)
) -> Set:
    try:
        db_set = await crud_set.update_set(db, set_id=set_id, set_in=set_in)
        if db_set is None:
            raise HTTPException(status_code=404, detail="Set not found")
        logger.info("Updated set", set_id=set_id)
        return db_set
    except IntegrityError as e:
        error_msg = str(e.orig)
        if "UNIQUE constraint failed" in error_msg:
            if "sets.source_url" in error_msg:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, 
                    detail=f"A set with the source URL '{set_in.source_url}' already exists!"
                )
        raise e

@router.post("/bulk-update", response_model=int)
async def bulk_update_sets(
        bulk_in: SetBulkUpdate,
        db: AsyncSession = Depends(get_db)
) -> int:
    count = await crud_set.bulk_update_sets(db=db, bulk_in=bulk_in)
    logger.info("Bulk updated sets", count=count, mode=bulk_in.operation_mode)
    return count

@router.post("/bulk-delete", response_model=int)
async def bulk_delete_sets(
        set_ids: list[int],
        db: AsyncSession = Depends(get_db)
) -> int:
    count = await crud_set.bulk_delete_sets(db=db, set_ids=set_ids)
    logger.info("Bulk deleted sets", count=count)
    return count

@router.post("/{set_id}/resync", response_model=Set)
async def resync_set(
    set_id: int,
    db: AsyncSession = Depends(get_db)
) -> Set:
    """
    Resynchronize a set with its local filesystem directory.
    
    Scans the `local_path` associated with the set. Any new image files found in the directory that aren't already in the database will be imported and added to the set.
    """
    db_set = await crud_set.resync_set(db, set_id=set_id)
    if db_set is None:
        raise HTTPException(status_code=404, detail="Set not found or path invalid")
    logger.info("Resynced set", set_id=set_id)
    return db_set

@router.delete("/{set_id}", response_model=Set)
async def delete_set(
        set_id: int,
        db: AsyncSession = Depends(get_db)
) -> Set:
    db_set = await crud_set.delete_set(db, set_id=set_id)
    if db_set is None:
        raise HTTPException(status_code=404, detail="Set not found")
    logger.info("Deleted set", set_id=set_id)
    return db_set
