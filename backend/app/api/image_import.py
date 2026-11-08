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
    ImageImportCleanupRequest,
    ImageImportCleanupResponse,
    ImageImportRequest,
    ImageImportValidationRequest,
    ImageImportValidationResponse,
)
from app.services import import_service

logger = structlog.get_logger(__name__)

router = APIRouter()


def get_temp_imports_root() -> Path:
    """Returns canonical root directory for staged temporary file imports."""
    root = Path(__file__).resolve().parent.parent.parent / "temp_imports"
    root.mkdir(parents=True, exist_ok=True)
    return root


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
    temp_dir = get_temp_imports_root() / str(uuid.uuid4())
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


@router.post("/import/cleanup-temp", response_model=ImageImportCleanupResponse)
async def cleanup_import_temp_files(
    req: ImageImportCleanupRequest,
) -> ImageImportCleanupResponse:
    """Cleans up staged temporary upload directories and files."""
    root = get_temp_imports_root().resolve()
    removed_count = 0

    if req.session_id:
        # Sanitize session_id to avoid path traversal
        safe_session = Path(req.session_id).name
        target_session_dir = (root / safe_session).resolve()
        if root in target_session_dir.parents and target_session_dir.exists():
            try:
                shutil.rmtree(target_session_dir, ignore_errors=True)
                removed_count += 1
            except Exception as e:
                logger.error("Failed to delete temp session dir", dir=str(target_session_dir), error=str(e))

    if req.paths:
        for p_str in req.paths:
            try:
                target_path = Path(p_str).resolve()
                if root in target_path.parents and target_path.exists():
                    if target_path.is_file():
                        target_path.unlink(missing_ok=True)
                        removed_count += 1
                        parent = target_path.parent
                        if parent != root and parent.exists() and not any(parent.iterdir()):
                            try:
                                parent.rmdir()
                            except Exception:
                                pass
                    elif target_path.is_dir():
                        shutil.rmtree(target_path, ignore_errors=True)
                        removed_count += 1
            except Exception as e:
                logger.error("Failed cleaning temp path", path=p_str, error=str(e))

    return ImageImportCleanupResponse(
        removed_count=removed_count,
        message=f"Cleaned up {removed_count} temporary items",
    )


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
@limiter.limit("60/minute")
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
