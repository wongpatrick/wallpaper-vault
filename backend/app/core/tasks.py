import asyncio
import json
import uuid
from typing import Dict, Any
from datetime import datetime

# In-memory task tracker
# key: task_id, value: {"status": str, "progress": int, "total": int, "updated_at": datetime}
tasks: Dict[str, Any] = {}

def create_task(status: str = "accepted") -> str:
    task_id = str(uuid.uuid4())
    tasks[task_id] = {
        "status": status,
        "progress": 0,
        "total": 0,
        "updated_at": datetime.now()
    }
    return task_id

def update_task(task_id: str, status: str = None, progress: int = None, total: int = None):
    if task_id in tasks:
        if status:
            tasks[task_id]["status"] = status
        if progress is not None:
            tasks[task_id]["progress"] = progress
        if total is not None:
            tasks[task_id]["total"] = total
        tasks[task_id]["updated_at"] = datetime.now()

async def event_stream():
    """Generator for Server-Sent Events"""
    while True:
        if tasks:
            # Prepare a serializable version of the tasks
            serializable_tasks = {}
            for tid, tinfo in tasks.items():
                serializable_tasks[tid] = {
                    "status": tinfo["status"],
                    "progress": tinfo["progress"],
                    "total": tinfo["total"],
                    "updated_at": tinfo["updated_at"].isoformat()
                }
            
            yield f"data: {json.dumps(serializable_tasks)}\n\n"
        
        # Cleanup tasks older than 30 seconds if they are in a final state
        now = datetime.now()
        to_delete = [
            tid for tid, tinfo in tasks.items() 
            if tinfo["status"] in ["completed", "error"] 
            and (now - tinfo["updated_at"]).total_seconds() > 30
        ]
        for tid in to_delete:
            del tasks[tid]

        await asyncio.sleep(1)
