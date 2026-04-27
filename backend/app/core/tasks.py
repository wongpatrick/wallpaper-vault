import asyncio
import json
import uuid
from typing import Dict, Any, Set, List
from datetime import datetime
from sqlalchemy import select, update
from app.db.session import SessionLocal
from app.models.task import Task
from app.schemas.task import TaskSchema

class TaskBroadcaster:
    def __init__(self):
        self.subscribers: Set[asyncio.Queue] = set()

    def subscribe(self) -> asyncio.Queue:
        queue = asyncio.Queue()
        self.subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue):
        self.subscribers.discard(queue)

    async def broadcast(self, task_data: Dict[str, Any]):
        if not self.subscribers:
            return
        
        # Convert datetime to ISO string for JSON serialization
        if isinstance(task_data.get("updated_at"), datetime):
            task_data["updated_at"] = task_data["updated_at"].isoformat()
            
        message = json.dumps({task_data["id"]: task_data})
        for queue in self.subscribers:
            await queue.put(message)

broadcaster = TaskBroadcaster()

async def create_task(db_session, status: str = "accepted") -> str:
    task_id = str(uuid.uuid4())
    new_task = Task(id=task_id, status=status)
    db_session.add(new_task)
    await db_session.commit()
    await db_session.refresh(new_task)
    
    # Broadcast the initial state
    await broadcaster.broadcast({
        "id": task_id,
        "status": status,
        "progress": 0,
        "total": 0,
        "updated_at": new_task.updated_at
    })
    return task_id

async def update_task(db_session, task_id: str, status: str = None, progress: int = None, total: int = None, error_message: str = None):
    update_data = {}
    if status: update_data["status"] = status
    if progress is not None: update_data["progress"] = progress
    if total is not None: update_data["total"] = total
    if error_message: update_data["error_message"] = error_message
    
    if update_data:
        stmt = update(Task).where(Task.id == task_id).values(**update_data)
        await db_session.execute(stmt)
        await db_session.commit()
        
        # Fetch the updated record to get the new 'updated_at' and confirm state
        result = await db_session.execute(select(Task).where(Task.id == task_id))
        updated_task = result.scalar_one_or_none()
        if updated_task:
            await broadcaster.broadcast({
                "id": updated_task.id,
                "status": updated_task.status,
                "progress": updated_task.progress,
                "total": updated_task.total,
                "error_message": updated_task.error_message,
                "updated_at": updated_task.updated_at
            })

async def event_stream():
    """Generator for Server-Sent Events using Pub/Sub with initial DB sync"""
    queue = broadcaster.subscribe()
    
    try:
        # Initial State Sync: Query DB for all non-completed tasks
        async with SessionLocal() as db:
            result = await db.execute(
                select(Task).where(Task.status.in_(["accepted", "processing"]))
            )
            active_tasks = result.scalars().all()
            if active_tasks:
                initial_data = {
                    t.id: {
                        "id": t.id,
                        "status": t.status,
                        "progress": t.progress,
                        "total": t.total,
                        "error_message": t.error_message,
                        "updated_at": t.updated_at.isoformat()
                    } for t in active_tasks
                }
                yield f"data: {json.dumps(initial_data)}\n\n"

        # Pub/Sub Loop
        while True:
            message = await queue.get()
            yield f"data: {message}\n\n"
            
    finally:
        broadcaster.unsubscribe(queue)

async def cleanup_zombie_tasks():
    """Mark all 'processing' tasks as 'error' on startup"""
    async with SessionLocal() as db:
        stmt = update(Task).where(Task.status == "processing").values(
            status="error", 
            error_message="Process interrupted by server restart"
        )
        await db.execute(stmt)
        await db.commit()
