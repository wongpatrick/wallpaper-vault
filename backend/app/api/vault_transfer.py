"""
API endpoints for cross-vault and local library path transfers.
"""
from typing import Optional

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, FileSystemError, ResourceNotFoundError
from app.db.session import get_db
from app.schemas.vault_transfer import (
    ImagesTransferExportResponse,
    IngestImageResponse,
    LocalTransferRequest,
    LocalTransferResponse,
    SetTransferPackage,
    TransferFinalizeRequest,
    TransferFinalizeResponse,
    TransferPreflightRequest,
    TransferPreflightResult,
)
from app.services import vault_transfer_service

logger = structlog.get_logger(__name__)

router = APIRouter()


@router.get("/export/set/{set_id}", response_model=SetTransferPackage)
async def export_set_package(
    set_id: int,
    db: AsyncSession = Depends(get_db),
) -> SetTransferPackage:
    """Export complete metadata package for a single Set and all its images."""
    try:
        return await vault_transfer_service.export_set(db, set_id)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except AppError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/export/images", response_model=ImagesTransferExportResponse)
async def export_images_package(
    image_ids: str = Query(..., description="Comma-separated list of image IDs to export"),
    db: AsyncSession = Depends(get_db),
) -> ImagesTransferExportResponse:
    """Export metadata packages for cherry-picked images grouped by source Set."""
    try:
        parsed_ids = [
            int(part.strip())
            for part in image_ids.split(",")
            if part.strip()
        ]
    except ValueError:
        raise HTTPException(status_code=400, detail="image_ids must be a comma-separated list of integers")

    if not parsed_ids:
        raise HTTPException(status_code=400, detail="At least one image ID must be provided")

    try:
        packages = await vault_transfer_service.export_images(db, parsed_ids)
        return ImagesTransferExportResponse(packages=packages)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except AppError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/preflight", response_model=TransferPreflightResult)
async def preflight_transfer(
    req: TransferPreflightRequest,
    db: AsyncSession = Depends(get_db),
) -> TransferPreflightResult:
    """Run collision and taxonomy preflight check on the destination vault."""
    try:
        return await vault_transfer_service.preflight_check(db, req.get_packages())
    except AppError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/ingest-image", response_model=IngestImageResponse)
async def ingest_transfer_image(
    transfer_session_id: str = Form(..., description="Staging session ID from preflight"),
    source_image_id: int = Form(..., description="Source vault image ID"),
    metadata: Optional[str] = Form(None, description="Optional serialized image metadata JSON"),
    file: UploadFile = File(..., description="Binary image file"),
) -> IngestImageResponse:
    """Stage an uploaded image binary on the destination vault prior to finalization."""
    try:
        return await vault_transfer_service.ingest_image(
            transfer_session_id=transfer_session_id,
            source_image_id=source_image_id,
            file=file,
        )
    except AppError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/finalize", response_model=TransferFinalizeResponse)
async def finalize_transfer(
    req: TransferFinalizeRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> TransferFinalizeResponse:
    """Commit staged transfer files and metadata to the destination vault database."""
    try:
        result, thumb_entries = await vault_transfer_service.finalize_transfer(db, req)
        if thumb_entries:
            background_tasks.add_task(
                vault_transfer_service.warm_thumbnails_background, thumb_entries
            )
        logger.info(
            "Finalized vault transfer",
            session_id=req.transfer_session_id,
            sets=result.created_set_ids,
            transferred=result.transferred_image_count,
            skipped=result.skipped_image_count,
        )
        return result
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except (AppError, FileSystemError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/local", response_model=LocalTransferResponse)
async def local_transfer(
    req: LocalTransferRequest,
    db: AsyncSession = Depends(get_db),
) -> LocalTransferResponse:
    """Relocate a set or selected images to another LibraryPath on the same vault."""
    try:
        res = await vault_transfer_service.local_transfer(db, req)
        logger.info(
            "Completed local library path transfer",
            destination_library_path_id=req.destination_library_path_id,
            set_ids=res.set_ids,
            moved_image_count=res.moved_image_count,
        )
        return res
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except (AppError, FileSystemError) as e:
        raise HTTPException(status_code=400, detail=str(e))
