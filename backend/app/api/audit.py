"""
API endpoints for running and managing library audits and issue resolutions.
"""

import os
from typing import Any
from typing import Optional
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, delete
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.schemas.tools import AuditIssuePage, AuditStartRequest, AuditFixAction
from app.models.audit import AuditIssue
from app.models.image import Image
from app.models.set import Set
from app.crud.settings import get_setting
from app.core import tasks
from app.core.enums import TaskStatus, AuditIssueStatus, AuditIssueType, ImageRating
from app.services import audit_service
import structlog
import cv2

logger = structlog.get_logger(__name__)

router = APIRouter()


@router.post("/start")
async def start_audit(
    request: AuditStartRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """
    Start a background library audit to detect filesystem and database inconsistencies.

    The audit scans for 'ghost' records (database entries missing files) and 'orphan' files (files missing database records). It clears any previously pending issues before starting a fresh scan.
    """
    # Check for existing active audit tasks
    await db.execute(
        select(tasks.Task).filter(
            tasks.Task.status.in_([TaskStatus.ACCEPTED, TaskStatus.PROCESSING])
        )
    )
    # This might catch other tasks, but since we only have audit and import,
    # we should ideally tag tasks. For now, let's check.

    vault_setting = await get_setting(db, "base_library_path")
    if not vault_setting or not vault_setting.value:
        raise HTTPException(status_code=400, detail="base_library_path not configured")

    # Clear ALL old pending/ignored issues before starting a fresh scan
    await db.execute(
        delete(AuditIssue).where(
            AuditIssue.status.in_([AuditIssueStatus.PENDING, AuditIssueStatus.IGNORED])
        )
    )
    await db.commit()

    task_id = await tasks.create_task(db, status=TaskStatus.ACCEPTED, prefix="audit")
    background_tasks.add_task(
        audit_service.run_library_audit, vault_setting.value, task_id
    )

    return {"task_id": task_id, "status": TaskStatus.ACCEPTED}


@router.get("/current")
async def get_current_audit(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Find the currently running audit task if any."""
    # Since we don't have task types yet, we'll look for the most recent active task
    result = await db.execute(
        select(tasks.Task)
        .filter(tasks.Task.status.in_([TaskStatus.ACCEPTED, TaskStatus.PROCESSING]))
        .order_by(tasks.Task.updated_at.desc())
        .limit(1)
    )
    task = result.scalars().first()
    if not task:
        return {"task_id": None}

    return {"task_id": task.id, "status": task.status, "progress": task.progress}


@router.get("/results", response_model=AuditIssuePage)
async def get_audit_results(
    skip: int = 0,
    limit: int = 50,
    issue_type: Optional[str] = None,
    status: str = AuditIssueStatus.PENDING,
    db: AsyncSession = Depends(get_db),
) -> AuditIssuePage:
    """Fetch paginated audit issues."""
    query = select(AuditIssue).filter(AuditIssue.status == status)

    if issue_type:
        query = query.filter(AuditIssue.issue_type == issue_type)

    # Get total count
    count_res = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_res.scalar_one()

    # Get items
    query = (
        query.options(selectinload(AuditIssue.set).selectinload(Set.creators))
        .offset(skip)
        .limit(limit)
    )

    res = await db.execute(query.order_by(AuditIssue.created_at.desc()))
    items = res.scalars().all()

    return AuditIssuePage(items=items, total=total, skip=skip, limit=limit)


@router.post("/resolve")
async def resolve_audit_issues(
    action: AuditFixAction, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    """
    Execute bulk resolution actions for discovered audit issues.

    Supports various fix strategies like 'purge' (delete DB record), 'repair' (fix paths), 'delete_file' (remove from disk), 'import' (add to existing set), and 'create_and_import' (create new set and import).
    """
    if not action.issue_ids:
        return {"status": "success", "count": 0}

    resolved_count = 0

    for issue_id in action.issue_ids:
        issue = await db.get(AuditIssue, issue_id)
        if not issue or issue.status != AuditIssueStatus.PENDING:
            continue

        try:
            async with db.begin_nested():
                if action.action == "purge" and issue.issue_type in (
                    AuditIssueType.GHOST,
                    AuditIssueType.DUPLICATE_ENTRY,
                    AuditIssueType.EMPTY_SET,
                    AuditIssueType.GHOST_SET,
                    AuditIssueType.ORPHAN_TAG,
                    AuditIssueType.ORPHAN_CREATOR,
                    AuditIssueType.ORPHAN_CHARACTER,
                    AuditIssueType.CORRUPTED_IMAGE,
                ):
                    if issue.issue_type in (
                        AuditIssueType.GHOST,
                        AuditIssueType.DUPLICATE_ENTRY,
                        AuditIssueType.CORRUPTED_IMAGE,
                    ):
                        if issue.image_id:
                            db_image = await db.get(Image, issue.image_id)
                            if db_image:
                                await db.delete(db_image)
                    elif issue.issue_type in (
                        AuditIssueType.EMPTY_SET,
                        AuditIssueType.GHOST_SET,
                    ):
                        if issue.set_id:
                            db_set = await db.get(Set, issue.set_id)
                            if db_set:
                                await db.delete(db_set)
                    elif issue.issue_type == AuditIssueType.ORPHAN_TAG:
                        from app.models.tag import Tag

                        tag_id = (
                            int(issue.path.split(":")[1]) if ":" in issue.path else None
                        )
                        if tag_id:
                            db_tag = await db.get(Tag, tag_id)
                            if db_tag:
                                await db.delete(db_tag)
                    elif issue.issue_type == AuditIssueType.ORPHAN_CREATOR:
                        from app.models.creator import Creator

                        creator_id = (
                            int(issue.path.split(":")[1]) if ":" in issue.path else None
                        )
                        if creator_id:
                            db_creator = await db.get(Creator, creator_id)
                            if db_creator:
                                await db.delete(db_creator)
                    elif issue.issue_type == AuditIssueType.ORPHAN_CHARACTER:
                        from app.models.character import Character

                        char_id = (
                            int(issue.path.split(":")[1]) if ":" in issue.path else None
                        )
                        if char_id:
                            db_character = await db.get(Character, char_id)
                            if db_character:
                                await db.delete(db_character)

                    issue.status = AuditIssueStatus.RESOLVED
                    resolved_count += 1

                elif (
                    action.action == "repair"
                    and issue.issue_type == AuditIssueType.GHOST
                    and issue.match_issue_id
                ):
                    # Update path to match the orphan's path
                    orphan_issue = await db.get(AuditIssue, issue.match_issue_id)
                    if orphan_issue:
                        await db.execute(
                            update(Image)
                            .where(Image.id == issue.image_id)
                            .values(local_path=orphan_issue.path)
                        )
                        issue.status = AuditIssueStatus.RESOLVED
                        orphan_issue.status = AuditIssueStatus.RESOLVED
                        resolved_count += 1

                elif (
                    action.action == "repair"
                    and issue.issue_type == AuditIssueType.PATH_MISMATCH
                ):
                    # Look up the set belonging to the physical directory
                    dir_path = Path(issue.path).parent
                    norm_dir = os.path.normcase(os.path.normpath(str(dir_path)))
                    # Find set matching this folder
                    set_res = await db.execute(
                        select(Set).filter(
                            func.lower(Set.local_path) == func.lower(norm_dir)
                        )
                    )
                    matching_set = set_res.scalars().first()
                    if matching_set:
                        await db.execute(
                            update(Image)
                            .where(Image.id == issue.image_id)
                            .values(set_id=matching_set.id)
                        )
                        issue.status = AuditIssueStatus.RESOLVED
                        resolved_count += 1
                    else:
                        raise ValueError(
                            f"No Set found for physical directory: {dir_path}"
                        )

                elif action.action == "delete_file" and issue.issue_type in (
                    AuditIssueType.ORPHAN,
                    AuditIssueType.CORRUPTED_IMAGE,
                ):
                    # Physically delete the file
                    p = Path(issue.path)
                    if p.exists():
                        p.unlink()

                    if (
                        issue.issue_type == AuditIssueType.CORRUPTED_IMAGE
                        and issue.image_id
                    ):
                        db_image = await db.get(Image, issue.image_id)
                        if db_image:
                            await db.delete(db_image)

                    issue.status = AuditIssueStatus.RESOLVED
                    resolved_count += 1

                elif (
                    action.action == "import"
                    and issue.issue_type == AuditIssueType.ORPHAN
                    and issue.set_id
                ):
                    # Quick import into existing set
                    p = Path(issue.path)
                    if p.exists():
                        img_data = audit_service.load_image(p)
                        h, w, phash = 0, 0, None
                        if img_data is not None:
                            h, w = img_data.shape[:2]
                            hasher = cv2.img_hash.PHash_create()
                            phash = hasher.compute(img_data).tobytes().hex()

                        resolved_path = str(p.resolve())

                        # Prevent duplicate entries for the exact same file path
                        existing = await db.execute(
                            select(Image.id).where(Image.local_path == resolved_path)
                        )
                        if existing.first():
                            issue.status = AuditIssueStatus.RESOLVED
                            resolved_count += 1
                            continue

                        # Calculate color and aspect label
                        from app.services.audit_service import calculate_dominant_color

                        h_ratio_setting = await get_setting(
                            db, "horizontal_target_ratio"
                        )
                        v_ratio_setting = await get_setting(db, "vertical_target_ratio")
                        h_label = (
                            h_ratio_setting.value.replace("/", "x")
                            if h_ratio_setting and h_ratio_setting.value
                            else "16x9"
                        )
                        v_label = (
                            v_ratio_setting.value.replace("/", "x")
                            if v_ratio_setting and v_ratio_setting.value
                            else "9x16"
                        )
                        aspect_label = h_label if w >= h else v_label
                        dc = calculate_dominant_color(p)

                        new_img = Image(
                            set_id=issue.set_id,
                            filename=p.name,
                            local_path=resolved_path,
                            width=w,
                            height=h,
                            file_size=p.stat().st_size,
                            aspect_ratio=float(w) / float(h) if h != 0 else 0,
                            aspect_ratio_label=aspect_label,
                            phash=phash,
                            dominant_color=dc,
                            rating=ImageRating.QUESTIONABLE,
                        )
                        db.add(new_img)
                        issue.status = AuditIssueStatus.RESOLVED
                        resolved_count += 1

                elif (
                    action.action == "create_and_import"
                    and issue.issue_type == AuditIssueType.ORPHAN
                ):
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
                        from app.crud.creator import get_creator_by_name
                        from app.models.creator import Creator

                        creator = await get_creator_by_name(db, creator_name)
                        if not creator:
                            creator = Creator(canonical_name=creator_name)
                            db.add(creator)
                            await db.flush()

                        # 3. Create Set
                        from app.crud.set import get_set_by_title_and_creator

                        existing_set = await get_set_by_title_and_creator(
                            db, set_title, creator.id
                        )
                        if not existing_set:
                            new_set = Set(
                                title=set_title,
                                local_path=str(dir_path.resolve()),
                                creators=[creator],
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

                        resolved_path = str(p.resolve())

                        # Prevent duplicate entries for the exact same file path
                        existing = await db.execute(
                            select(Image.id).where(Image.local_path == resolved_path)
                        )
                        if existing.first():
                            issue.status = AuditIssueStatus.RESOLVED
                            resolved_count += 1
                            continue

                        # Calculate color and aspect label
                        from app.services.audit_service import calculate_dominant_color

                        h_ratio_setting = await get_setting(
                            db, "horizontal_target_ratio"
                        )
                        v_ratio_setting = await get_setting(db, "vertical_target_ratio")
                        h_label = (
                            h_ratio_setting.value.replace("/", "x")
                            if h_ratio_setting and h_ratio_setting.value
                            else "16x9"
                        )
                        v_label = (
                            v_ratio_setting.value.replace("/", "x")
                            if v_ratio_setting and v_ratio_setting.value
                            else "9x16"
                        )
                        aspect_label = h_label if w >= h else v_label
                        dc = calculate_dominant_color(p)

                        new_img = Image(
                            set_id=target_set_id,
                            filename=p.name,
                            local_path=resolved_path,
                            width=w,
                            height=h,
                            file_size=p.stat().st_size,
                            aspect_ratio=float(w) / float(h) if h != 0 else 0,
                            aspect_ratio_label=aspect_label,
                            phash=phash,
                            dominant_color=dc,
                            rating=ImageRating.QUESTIONABLE,
                        )
                        db.add(new_img)
                        issue.status = AuditIssueStatus.RESOLVED
                        resolved_count += 1

                elif action.action == "ignore":
                    issue.status = AuditIssueStatus.IGNORED
                    resolved_count += 1

        except Exception as e:
            logger.error(
                "Error resolving issue", issue_id=issue_id, error=str(e), exc_info=True
            )
            continue

    await db.commit()
    return {"status": "success", "resolved_count": resolved_count}
