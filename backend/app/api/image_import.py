"""
API router for image import and path validation endpoints.
"""

from pathlib import Path
import shutil
import uuid
import anyio
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.core import tasks
from app.core.crop import collect_image_paths
from app.core.rate_limit import limiter
from app.db.session import SessionLocal, get_db
from app.schemas.image import (
    ImageImportRequest,
    ImageImportValidationRequest,
    ImageImportValidationResponse,
)
from app.services import import_service

logger = structlog.get_logger(__name__)

router = APIRouter()


@router.post("/import/validate", response_model=ImageImportValidationResponse)
async def validate_import_paths(
    req: ImageImportValidationRequest,
    db: AsyncSession = Depends(get_db),
) -> ImageImportValidationResponse:
    """Validate a list of local paths (files or folders) and detect duplicate images."""
    try:
        return await import_service.validate_local_paths(db, req.local_paths)
    except Exception as e:
        logger.exception("Error during local path validation")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/import/validate-files", response_model=ImageImportValidationResponse
)
async def validate_import_uploaded_files(
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
) -> ImageImportValidationResponse:
    """Accepts uploaded files, saves them to a temporary directory, and validates them for import."""
    temp_dir = Path("../backend/temp_imports") / str(uuid.uuid4())
    temp_dir.mkdir(parents=True, exist_ok=True)

    local_paths = []
    for file in files:
        raw_name = (file.filename or "").replace("\\", "/").rstrip("/")
        safe_filename = Path(raw_name).name
        if not safe_filename:
            safe_filename = "upload"
        unique_name = f"{uuid.uuid4().hex[:8]}_{safe_filename}"
        temp_file_path = temp_dir / unique_name
        try:
            with open(temp_file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            local_paths.append(str(temp_file_path.resolve()))
        finally:
            file.file.close()

    try:
        return await import_service.validate_local_paths(db, local_paths)
    except Exception as e:
        logger.exception("Error during uploaded file validation")
        await anyio.to_thread.run_sync(shutil.rmtree, temp_dir, True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import/scan-paths", response_model=list[str])
async def scan_import_paths(
    req: ImageImportValidationRequest,
) -> list[str]:
    """Recursively scans local paths and returns a flat list of all image file paths found."""
    all_file_paths = []
    for p_str in req.local_paths:
        p = Path(p_str)
        if p.is_dir():
            collected = collect_image_paths(p_str, recursive=True)
            all_file_paths.extend(collected)
        else:
            all_file_paths.append(p_str)
    return all_file_paths


@router.post("/import", response_model=str)
@limiter.limit("5/minute")
async def import_images(
    request: Request,
    req: ImageImportRequest,
    background_tasks: BackgroundTasks,
) -> str:
    """Triggers an asynchronous background task to import images and folders into the library."""
    async with SessionLocal() as db:
        task_id = await tasks.create_task(
            db_session=db, status="accepted", prefix="import"
        )
    req_dict = req.model_dump()
    background_tasks.add_task(
        import_service.import_images_background_task, req_dict, task_id
    )
    logger.info("Started images import background task", task_id=task_id)
    return task_id
