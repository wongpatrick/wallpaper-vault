from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, delete
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.schemas.tools import AuditIssuePage, AuditStartRequest, AuditFixAction
from app.models.audit import AuditIssue
from app.models.image import Image
from app.models.set import Set
from app.models.creator import Creator
from app.crud.settings import get_setting
from app.core import tasks
from app.services import audit_service
import cv2

router = APIRouter()

@router.post("/start")
async def start_audit(
    request: AuditStartRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """Start a background library audit."""
    # Check for existing active audit tasks
    existing_task = await db.execute(
        select(tasks.Task).filter(tasks.Task.status.in_(["accepted", "processing"]))
    )
    # This might catch other tasks, but since we only have audit and import, 
    # we should ideally tag tasks. For now, let's just check.
    # To be safer, let's check for recent tasks.
    
    vault_setting = await get_setting(db, "base_library_path")
    if not vault_setting or not vault_setting.value:
        raise HTTPException(status_code=400, detail="base_library_path not configured")
    
    # Clear ALL old pending/ignored issues before starting a fresh scan
    await db.execute(delete(AuditIssue).where(AuditIssue.status.in_(["pending", "ignored"])))
    await db.commit()
    
    task_id = await tasks.create_task(db, status="accepted")
    background_tasks.add_task(audit_service.run_library_audit, vault_setting.value, task_id)
    
    return {"task_id": task_id, "status": "accepted"}

@router.get("/current")
async def get_current_audit(db: AsyncSession = Depends(get_db)):
    """Find the currently running audit task if any."""
    # Since we don't have task types yet, we'll look for the most recent active task
    result = await db.execute(
        select(tasks.Task)
        .filter(tasks.Task.status.in_(["accepted", "processing"]))
        .order_by(tasks.Task.updated_at.desc())
        .limit(1)
    )
    task = result.scalars().first()
    if not task:
        return {"task_id": None}
    
    return {
        "task_id": task.id, 
        "status": task.status, 
        "progress": task.progress
    }

@router.get("/results", response_model=AuditIssuePage)
async def get_audit_results(
    skip: int = 0,
    limit: int = 50,
    issue_type: Optional[str] = None,
    status: str = "pending",
    db: AsyncSession = Depends(get_db)
):
    """Fetch paginated audit issues."""
    query = select(AuditIssue).filter(AuditIssue.status == status)
    
    if issue_type:
        query = query.filter(AuditIssue.issue_type == issue_type)
    
    # Get total count
    count_res = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_res.scalar_one()
    
    # Get items
    query = query.offset(skip).limit(limit)
    
    res = await db.execute(query.order_by(AuditIssue.created_at.desc()))
    items = res.scalars().all()
    
    return AuditIssuePage(items=items, total=total, skip=skip, limit=limit)

@router.post("/resolve")
async def resolve_audit_issues(
    action: AuditFixAction,
    db: AsyncSession = Depends(get_db)
):
    """Execute bulk resolution actions."""
    if not action.issue_ids:
        return {"status": "success", "count": 0}

    resolved_count = 0
    
    for issue_id in action.issue_ids:
        issue = await db.get(AuditIssue, issue_id)
        if not issue or issue.status != "pending":
            continue
            
        try:
            if action.action == "purge" and issue.issue_type == "ghost":
                # Delete the DB record
                await db.execute(delete(Image).where(Image.id == issue.image_id))
                issue.status = "resolved"
                resolved_count += 1
                
            elif action.action == "repair" and issue.issue_type == "ghost" and issue.match_issue_id:
                # Update path to match the orphan's path
                orphan_issue = await db.get(AuditIssue, issue.match_issue_id)
                if orphan_issue:
                    await db.execute(
                        update(Image)
                        .where(Image.id == issue.image_id)
                        .values(local_path=orphan_issue.path)
                    )
                    issue.status = "resolved"
                    orphan_issue.status = "resolved"
                    resolved_count += 1
            
            elif action.action == "delete_file" and issue.issue_type == "orphan":
                # Physically delete the file
                p = Path(issue.path)
                if p.exists():
                    p.unlink()
                issue.status = "resolved"
                resolved_count += 1
                
            elif action.action == "import" and issue.issue_type == "orphan" and issue.set_id:
                # Quick import into existing set
                p = Path(issue.path)
                if p.exists():
                    img_data = audit_service.load_image(p)
                    h, w, phash = 0, 0, None
                    if img_data is not None:
                        h, w = img_data.shape[:2]
                        hasher = cv2.img_hash.PHash_create()
                        phash = hasher.compute(img_data).tobytes().hex()
                    
                    new_img = Image(
                        set_id=issue.set_id,
                        filename=p.name,
                        local_path=str(p.resolve()),
                        width=w, height=h,
                        file_size=p.stat().st_size,
                        aspect_ratio=float(w)/float(h) if h != 0 else 0,
                        phash=phash
                    )
                    db.add(new_img)
                    issue.status = "resolved"
                    resolved_count += 1

            elif action.action == "create_and_import" and issue.issue_type == "orphan":
                # Create a NEW set from the folder and import
                dir_path = Path(issue.directory)
                if dir_path.exists():
                    # 1. Parse folder name (e.g. "Creator - Title")
                    folder_name = dir_path.name
                    creator_name, set_title = "Unknown", folder_name
                    if " - " in folder_name:
                        parts = folder_name.split(" - ", 1)
                        creator_name, set_title = parts[0].strip(), parts[1].strip()
                    
                    # 2. Get/Create Creator
                    from app.crud.creator import get_creator_by_name, create_creator
                    from app.schemas.creator import CreatorCreate
                    creator = await get_creator_by_name(db, creator_name)
                    if not creator:
                        creator = await create_creator(db, CreatorCreate(canonical_name=creator_name))
                    
                    # 3. Create Set
                    from app.crud.set import get_set_by_title_and_creator
                    existing_set = await get_set_by_title_and_creator(db, set_title, creator.id)
                    if not existing_set:
                        new_set = Set(
                            title=set_title,
                            local_path=str(dir_path.resolve()),
                            creators=[creator]
                        )
                        db.add(new_set)
                        await db.flush()
                        target_set_id = new_set.id
                    else:
                        target_set_id = existing_set.id
                    
                    # 4. Import the image
                    p = Path(issue.path)
                    img_data = audit_service.load_image(p)
                    h, w, phash = 0, 0, None
                    if img_data is not None:
                        h, w = img_data.shape[:2]
                        hasher = cv2.img_hash.PHash_create()
                        phash = hasher.compute(img_data).tobytes().hex()
                    
                    new_img = Image(
                        set_id=target_set_id,
                        filename=p.name,
                        local_path=str(p.resolve()),
                        width=w, height=h,
                        file_size=p.stat().st_size,
                        aspect_ratio=float(w)/float(h) if h != 0 else 0,
                        phash=phash
                    )
                    db.add(new_img)
                    issue.status = "resolved"
                    resolved_count += 1

            elif action.action == "ignore":
                issue.status = "ignored"
                resolved_count += 1
                
        except Exception as e:
            print(f"Error resolving issue {issue_id}: {e}")
            continue

    await db.commit()
    return {"status": "success", "resolved_count": resolved_count}
