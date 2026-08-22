"""
API endpoints for managing library storage paths.
"""
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.crud import library_path as crud_library_path
from app.schemas.library_path import (
    LibraryPath,
    LibraryPathCreate,
    LibraryPathUpdate,
    LibraryPathPage,
)
from app.services.library_scan_service import scan_library_path_background_task
from app.core import tasks
from app.core.enums import TaskStatus
from app.core.rate_limit import limiter
import structlog

logger = structlog.get_logger(__name__)

router = APIRouter()

@router.get("/", response_model=LibraryPathPage)
async def list_library_paths(
    db: AsyncSession = Depends(get_db),
) -> LibraryPathPage:
    """Retrieve all configured library storage paths with set counts."""
    items, total = await crud_library_path.list_library_paths(db)
    return LibraryPathPage(items=items, total=total)

@router.post("/", response_model=LibraryPath)
@limiter.limit("10/minute")
async def create_library_path(
    request: Request,
    path_in: LibraryPathCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> LibraryPath:
    """
    Register a new library storage directory.
    
    Optionally launches a background task to auto-scan existing set folders and images within the directory.
    """
    raw_path = path_in.path.strip()
    if not raw_path:
        raise HTTPException(status_code=400, detail="Path cannot be empty.")

    p = Path(raw_path)
    if not p.exists():
        try:
            p.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Directory does not exist and could not be created: {e}")

    if not p.is_dir():
        raise HTTPException(status_code=400, detail=f"Specified path is not a directory: {raw_path}")

    # Check for duplicate path
    existing = await crud_library_path.get_library_path_by_path(db, raw_path)
    if existing:
        raise HTTPException(status_code=400, detail="This library path is already configured.")

    db_obj = await crud_library_path.create_library_path(db, path_in)
    await db.commit()

    if path_in.scan_existing:
        task_id = await tasks.create_task(db, status=TaskStatus.ACCEPTED, prefix="scan")
        background_tasks.add_task(scan_library_path_background_task, db_obj.id, task_id)
        logger.info("Queued auto-scan for new library path", library_path_id=db_obj.id, task_id=task_id)

    return LibraryPath(
        id=db_obj.id,
        path=db_obj.path,
        label=db_obj.label,
        is_default=db_obj.is_default,
        created_at=str(db_obj.created_at) if db_obj.created_at else None,
        set_count=0
    )

@router.get("/{path_id}", response_model=LibraryPath)
async def get_library_path(
    path_id: int,
    db: AsyncSession = Depends(get_db),
) -> LibraryPath:
    """Retrieve details for a single library path."""
    db_obj = await crud_library_path.get_library_path(db, path_id)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Library path not found")
    
    from sqlalchemy import select, func
    from app.models.set import Set
    set_count = (await db.execute(select(func.count(Set.id)).where(Set.library_path_id == path_id))).scalar() or 0

    return LibraryPath(
        id=db_obj.id,
        path=db_obj.path,
        label=db_obj.label,
        is_default=db_obj.is_default,
        created_at=str(db_obj.created_at) if db_obj.created_at else None,
        set_count=set_count
    )

@router.put("/{path_id}", response_model=LibraryPath)
async def update_library_path(
    path_id: int,
    path_in: LibraryPathUpdate,
    db: AsyncSession = Depends(get_db),
) -> LibraryPath:
    """Update label or default status of a library path."""
    db_obj = await crud_library_path.update_library_path(db, path_id, path_in)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Library path not found")
    await db.commit()

    from sqlalchemy import select, func
    from app.models.set import Set
    set_count = (await db.execute(select(func.count(Set.id)).where(Set.library_path_id == path_id))).scalar() or 0

    return LibraryPath(
        id=db_obj.id,
        path=db_obj.path,
        label=db_obj.label,
        is_default=db_obj.is_default,
        created_at=str(db_obj.created_at) if db_obj.created_at else None,
        set_count=set_count
    )

@router.delete("/{path_id}")
async def delete_library_path(
    path_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """
    Delete a library path from the database.
    Unlinks associated sets (setting library_path_id = NULL) without deleting files from disk.
    """
    success = await crud_library_path.delete_library_path(db, path_id)
    if not success:
        raise HTTPException(status_code=404, detail="Library path not found")
    await db.commit()
    return {"status": "success", "message": f"Library path {path_id} deleted."}

@router.post("/{path_id}/scan")
@limiter.limit("5/minute")
async def scan_library_path(
    request: Request,
    path_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Trigger a manual background scan of a library path."""
    db_obj = await crud_library_path.get_library_path(db, path_id)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Library path not found")

    task_id = await tasks.create_task(db, status=TaskStatus.ACCEPTED, prefix="scan")
    background_tasks.add_task(scan_library_path_background_task, path_id, task_id)
    return {"status": "accepted", "task_id": task_id}
