"""
API endpoints for retrieving aggregated dashboard statistics and system health alerts.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.crud import dashboard as crud_dashboard
from app.schemas.dashboard import DashboardData

router = APIRouter()

@router.get("/", response_model=DashboardData)
async def read_dashboard_data(
    db: AsyncSession = Depends(get_db)
) -> DashboardData:
    """
    Retrieve aggregated dashboard statistics and system health alerts.
    
    Provides high-level library stats (total images, sets, creators, disk usage) alongside actionable health alerts (e.g., missing thumbnails, orphaned files) that require user attention.
    """
    return await crud_dashboard.get_dashboard_data(db)
