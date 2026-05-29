"""
API endpoints for managing wallpaper sets, including creation, import, and bulk operations.
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
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
async def event_stream():
    return StreamingResponse(tasks.event_stream(), media_type="text/event-stream")

@router.post("/", response_model=Set)
async def create_set(
        set_in: SetCreate,
        db: AsyncSession = Depends(get_db)
):
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
):
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
):
    db_set = await crud_set.import_set(db=db, set_in=set_in)
    logger.info("Imported set", set_id=db_set.id, title=db_set.title)
    return db_set

@router.post("/batch-import", response_model=BatchImportResponse)
async def batch_import_sets(
        batch_in: BatchImportRequest,
        background_tasks: BackgroundTasks,
        db: AsyncSession = Depends(get_db)
):
    """
    Unified route to scan, parse, and optionally execute batch imports.
    If dry_run=True, it only scans and returns parsed items.
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
        db: AsyncSession = Depends(get_db)
):
    sets, total = await crud_set.get_sets(db, skip=skip, limit=limit, search=search, creator_type=creator_type)
    return SetPage(items=sets, total=total, skip=skip, limit=limit)

@router.get("/{set_id}", response_model=Set)
async def read_set(
        set_id: int,
        db: AsyncSession = Depends(get_db)
):
    db_set = await crud_set.get_set(db, set_id=set_id)
    if db_set is None:
        raise HTTPException(status_code=404, detail="Set not found")
    return db_set

@router.patch("/{set_id}", response_model=Set)
async def update_set(
        set_id: int,
        set_in: SetUpdate,
        db: AsyncSession = Depends(get_db)
):
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
):
    count = await crud_set.bulk_update_sets(db=db, bulk_in=bulk_in)
    logger.info("Bulk updated sets", count=count, mode=bulk_in.operation_mode)
    return count

@router.post("/bulk-delete", response_model=int)
async def bulk_delete_sets(
        set_ids: list[int],
        db: AsyncSession = Depends(get_db)
):
    count = await crud_set.bulk_delete_sets(db=db, set_ids=set_ids)
    logger.info("Bulk deleted sets", count=count)
    return count

@router.post("/{set_id}/resync", response_model=Set)
async def resync_set(
    set_id: int,
    db: AsyncSession = Depends(get_db)
):
    db_set = await crud_set.resync_set(db, set_id=set_id)
    if db_set is None:
        raise HTTPException(status_code=404, detail="Set not found or path invalid")
    logger.info("Resynced set", set_id=set_id)
    return db_set

@router.delete("/{set_id}", response_model=Set)
async def delete_set(
        set_id: int,
        db: AsyncSession = Depends(get_db)
):
    db_set = await crud_set.delete_set(db, set_id=set_id)
    if db_set is None:
        raise HTTPException(status_code=404, detail="Set not found")
    logger.info("Deleted set", set_id=set_id)
    return db_set
