from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db

from app.crud import set as crud_set
from app.schemas.set import Set, SetCreate, SetImport, BatchImportRequest, BatchImportResponse
from app.core import tasks


router = APIRouter()

@router.get("/events")
async def event_stream():
    return StreamingResponse(tasks.event_stream(), media_type="text/event-stream")

@router.post("/", response_model=Set)
async def create_set(
        set_in: SetCreate,
        db: AsyncSession = Depends(get_db)
):
    return await crud_set.create_set(db=db, set_in=set_in)

@router.post("/import", response_model=Set)
async def import_set(
        set_in: SetImport,
        db: AsyncSession = Depends(get_db)
):
    return await crud_set.import_set(db=db, set_in=set_in)

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
    task_id = tasks.create_task(status="accepted")
    background_tasks.add_task(crud_set.run_batch_import_background, batch_in, task_id)
    
    return BatchImportResponse(
        items=[], 
        task_id=task_id, 
        status="accepted",
        summary={"message": "Batch import started in background"}
    )

@router.get("/", response_model=list[Set])
async def read_sets(
        skip: int = 0,
        limit: int = 100,
        db: AsyncSession = Depends(get_db)
):
    sets = await crud_set.get_sets(db, skip=skip, limit=limit)
    return sets

@router.get("/{set_id}", response_model=Set)
async def read_set(
        set_id: int,
        db: AsyncSession = Depends(get_db)
):
    db_set = await crud_set.get_set(db, set_id=set_id)
    if db_set is None:
        raise HTTPException(status_code=404, detail="Set not found")
    return db_set