from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.crud import dashboard as crud_dashboard
from app.schemas.dashboard import DashboardData

router = APIRouter()

@router.get("/", response_model=DashboardData)
async def read_dashboard_data(
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieve aggregated dashboard statistics and health alerts.
    """
    return await crud_dashboard.get_dashboard_data(db)
