"""
API endpoints for background task management and cancellation.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import structlog

from app.db.session import get_db
from app.models.task import Task
from app.core import tasks
from app.core.enums import TaskStatus

logger = structlog.get_logger(__name__)

router = APIRouter()


class TaskCancelResponse(BaseModel):
    task_id: str
    status: str
    message: str


@router.post("/{task_id}/cancel", response_model=TaskCancelResponse)
async def cancel_task_endpoint(
    task_id: str,
    db: AsyncSession = Depends(get_db),
) -> TaskCancelResponse:
    """Request cooperative cancellation of a background task."""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )

    if task.status in [
        TaskStatus.COMPLETED,
        TaskStatus.ERROR,
        TaskStatus.CANCELLED,
    ]:
        return TaskCancelResponse(
            task_id=task_id,
            status=task.status,
            message=f"Task is already in terminal state: {task.status}",
        )

    # Register in-memory cancellation and update task status
    await tasks.cancel_task(db, task_id)
    return TaskCancelResponse(
        task_id=task_id,
        status=TaskStatus.CANCELLED,
        message="Task cancellation requested",
    )
