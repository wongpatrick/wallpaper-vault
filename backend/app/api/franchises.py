"""API endpoints for franchises."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.db.session import get_db
from app.crud import franchise as crud_franchise
from app.schemas.franchise import Franchise, FranchiseCreate, FranchiseUpdate, FranchiseMerge
from app.schemas.bulk import BulkDeleteRequest

router = APIRouter()

@router.get("/", response_model=List[Franchise])
async def read_franchises(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """Retrieve all franchises."""
    franchises = await crud_franchise.get_franchises(db, skip=skip, limit=limit)
    return franchises

@router.post("/", response_model=Franchise)
async def create_franchise(
    franchise: FranchiseCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new franchise."""
    # Ensure name is unique
    existing = await crud_franchise.get_franchise_by_name(db, franchise.name)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Franchise already exists."
        )
    try:
        res = await crud_franchise.create_franchise(db, franchise)
        await db.commit()
        return res
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.patch("/{franchise_id}", response_model=Franchise)
async def update_franchise(
    franchise_id: int,
    franchise_in: FranchiseUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update a franchise's name."""
    try:
        db_franchise = await crud_franchise.update_franchise(db, franchise_id, franchise_in)
        if not db_franchise:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Franchise not found")
        await db.commit()
        return db_franchise
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.delete("/{franchise_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_franchise(
    franchise_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Delete a franchise."""
    success = await crud_franchise.delete_franchise(db, franchise_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Franchise not found")
    await db.commit()

@router.post("/bulk-delete", status_code=status.HTTP_204_NO_CONTENT)
async def bulk_delete_franchises(
    request: BulkDeleteRequest,
    db: AsyncSession = Depends(get_db)
):
    """Bulk delete multiple franchises."""
    await crud_franchise.bulk_delete_franchises(db, request.ids)
    await db.commit()
    return None


@router.post("/merge", response_model=Franchise)
async def merge_franchises(
    merge_in: FranchiseMerge,
    db: AsyncSession = Depends(get_db)
):
    """Merge multiple franchises into one."""
    if merge_in.target_id in merge_in.source_ids:
        raise HTTPException(status_code=400, detail="Cannot merge a franchise into itself")
        
    db_franchise = await crud_franchise.merge_franchises(
        db, 
        source_ids=merge_in.source_ids, 
        target_id=merge_in.target_id
    )
    if not db_franchise:
        raise HTTPException(status_code=404, detail="Target franchise not found")
        
    await db.commit()
    return db_franchise
