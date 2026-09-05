"""
Processor for executing batch and image import tasks into the vault.
"""

import os
from pathlib import Path
import re
import tempfile
from typing import Any, Optional
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import structlog

from app.core import tasks
from app.core.aspect_ratio import get_aspect_ratio_labels, parse_ratio
from app.core.color_utils import get_color_bucket
from app.core.crop import (
    collect_image_paths,
    compute_focal_point,
    load_image,
    process_image,
)
from app.core.enums import ImageRating, TaskStatus
from app.core.image_analysis import calculate_dominant_color, calculate_phash
from app.core.log_utils import safe_log_val as _safe_log_val
from app.core.utils import sanitize_filename
from app.core.vault_utils import resolve_vault_root
from app.crud.creator import create_creator, get_creator_by_name
from app.crud.tag import get_tags_by_names
from app.db.session import SessionLocal
from app.models.image import Image as ImageModel
from app.models.set import Set as SetModel
from app.schemas.creator import CreatorCreate
from app.schemas.image import ImageImportValidationResponse, ImageValidationItem
from app.schemas.set import (
    BatchImportItem,
    BatchImportRequest,
    BatchImportResponse,
)
from app.services.ai_tagging_service import (
    apply_set_tag_rollups,
    get_ai_tagging_config,
    tag_image_file,
)
from app.services.file_service import (
    cleanup_source_directories,
    delete_dir_if_empty,
    delete_dir_if_empty_async,
    retry_delete,
    retry_delete_sync,
    retry_delete_sync as _retry_delete,
)
from app.services.import_parser import (
    compile_parsing_regex,
    gather_candidates,
    parse_and_validate_candidates,
)

logger = structlog.get_logger(__name__)

# Preserve re-exports for backwards compatibility
__all__ = [
    "retry_delete_sync",
    "_retry_delete",
    "retry_delete",
    "delete_dir_if_empty",
    "delete_dir_if_empty_async",
    "cleanup_source_directories",
    "gather_candidates",
    "compile_parsing_regex",
    "parse_and_validate_candidates",
    "execute_import_item",
    "validate_local_paths",
    "import_images_background_task",
    "batch_import_sets",
    "run_batch_import_background",
    "load_image",
]


async def execute_import_item(
    db: AsyncSession,
    item: BatchImportItem,
    vault_root: Path,
    h_ratio: float,
    v_ratio: float,
    h_label: str,
    v_label: str,
    delete_source_default: bool,
    task_id: Optional[str] = None,
    progress_state: Optional[dict] = None,
) -> BatchImportItem:
    """Phase 3: Process images and save to database for a single item."""
    from app.crud.set import get_set_by_title_and_creators

    if not item.is_valid:
        item.status = "error"
        item.error = "Invalid parsing"
        return item

    try:
        ai_config = await get_ai_tagging_config(db)

        logger.info(
            "Executing import item with AI auto-tagging config",
            set_title=_safe_log_val(item.set_title),
            auto_tag_enabled=ai_config["enabled"],
            model_type=_safe_log_val(ai_config["model_type"]),
            confidence_threshold=ai_config["confidence_threshold"],
            rollup_threshold=ai_config["rollup_threshold"],
        )

        raw_names = re.split(r"\s*[\&＆,/+]\s*", item.creator_name)
        creator_names = [n.strip() for n in raw_names if n.strip()]
        if not creator_names:
            creator_names = (
                [item.creator_name.strip()]
                if item.creator_name.strip()
                else ["Unknown"]
            )

        db_creators = []
        for name in creator_names:
            c = await get_creator_by_name(db, name)
            if not c:
                c = await create_creator(db, CreatorCreate(canonical_name=name))
            db_creators.append(c)

        joined_creators = " & ".join([c.canonical_name for c in db_creators])

        folder_name = sanitize_filename(f"{joined_creators} - {item.set_title}")
        dest_dir = vault_root / folder_name
        dest_dir.mkdir(parents=True, exist_ok=True)

        creator_ids = [c.id for c in db_creators]
        existing = await get_set_by_title_and_creators(
            db, item.set_title, creator_ids, load_relations=False
        )

        if existing:
            item.status = "error"
            item.error = "Set already exists for these creators"
            if progress_state and task_id:
                image_paths = collect_image_paths(
                    item.source_path, recursive=True
                )
                progress_state["processed"] += len(image_paths)
                await tasks.update_task(
                    db,
                    task_id,
                    progress=progress_state["processed"],
                    total=progress_state["total"],
                )
            return item

        image_paths = collect_image_paths(item.source_path, recursive=True)
        db_images = []
        all_detected_characters = set()

        processed_in_item = 0
        try:
            for img_path in image_paths:
                p = Path(img_path)
                base_out = dest_dir / p.name

                ok, final_p_str = process_image(
                    img_path,
                    str(base_out),
                    auto_orient=True,
                    sort_output=False,
                    horz_ar=h_ratio,
                    vert_ar=v_ratio,
                    horz_label=h_label,
                    vert_label=v_label,
                )

                if ok:
                    final_p = Path(final_p_str)
                    img_data = load_image(final_p_str)
                    if img_data is not None:
                        h, w = img_data.shape[:2]
                        ratio_label = (
                            h_label
                            if final_p.name.startswith(f"{h_label}.")
                            else v_label
                        )

                        fx, fy = compute_focal_point(img_data)

                        image_tags_list, image_characters_list = (
                            await tag_image_file(
                                db,
                                ai_config,
                                final_p_str,
                                all_detected_characters,
                            )
                        )

                        dom_color = calculate_dominant_color(final_p)
                        db_images.append(
                            ImageModel(
                                filename=final_p.name,
                                local_path=str(final_p.resolve()),
                                width=w,
                                height=h,
                                file_size=final_p.stat().st_size,
                                aspect_ratio=float(w) / float(h) if h != 0 else 0,
                                aspect_ratio_label=ratio_label,
                                phash=calculate_phash(final_p),
                                dominant_color=dom_color,
                                dominant_color_bucket=get_color_bucket(dom_color),
                                rating=ImageRating.QUESTIONABLE,
                                focal_point_x=fx,
                                focal_point_y=fy,
                                tags=image_tags_list,
                                characters=image_characters_list,
                            )
                        )

                processed_in_item += 1
                if progress_state and task_id:
                    progress_state["processed"] += 1
                    await tasks.update_task(
                        db,
                        task_id,
                        progress=progress_state["processed"],
                        total=progress_state["total"],
                    )
        except Exception as process_err:
            unprocessed = len(image_paths) - processed_in_item
            if unprocessed > 0 and progress_state and task_id:
                progress_state["processed"] += unprocessed
                await tasks.update_task(
                    db,
                    task_id,
                    progress=progress_state["processed"],
                    total=progress_state["total"],
                )
            raise process_err

        db_set = SetModel(
            title=item.set_title,
            local_path=os.path.normpath(str(dest_dir.resolve())),
        )
        db_set.creators = db_creators
        db_set.images = db_images

        await apply_set_tag_rollups(
            db,
            db_set,
            db_images,
            all_detected_characters,
            ai_config["rollup_threshold"],
        )

        db.add(db_set)

        if delete_source_default:
            source_p = Path(item.source_path)
            is_dir = source_p.is_dir()
            deleted, err = await retry_delete(source_p, is_dir)
            if not deleted:
                if is_dir:
                    logger.error(
                        "Failed to delete batch source directory after retries due to lock",
                        path=item.source_path,
                        error=err,
                    )
                else:
                    logger.error(
                        "Failed to delete batch source file after retries due to lock",
                        path=item.source_path,
                        error=err,
                    )
            elif not is_dir:
                parent = source_p.parent
                try:
                    if await delete_dir_if_empty_async(parent):
                        logger.info(
                            "Deleted empty source directory", path=str(parent)
                        )
                except Exception as dir_err:
                    logger.error(
                        "Failed to delete empty source directory",
                        path=str(parent),
                        error=str(dir_err),
                    )

        item.status = "success"
    except Exception as e:
        item.status = "error"
        item.error = str(e)
        if progress_state and task_id:
            try:
                paths = locals().get("image_paths")
                if paths is None:
                    paths = collect_image_paths(item.source_path, recursive=True)
                unprocessed = len(paths) - locals().get("processed_in_item", 0)
                if unprocessed > 0:
                    progress_state["processed"] += unprocessed
                    await tasks.update_task(
                        db,
                        task_id,
                        progress=progress_state["processed"],
                        total=progress_state["total"],
                    )
            except Exception:
                pass

    return item


async def validate_local_paths(db: AsyncSession, local_paths: list[str]) -> Any:
    """Recursively validates local paths (files or folders) for import and detects visual duplicates."""
    h_label, v_label = await get_aspect_ratio_labels(db)
    h_ratio = parse_ratio(h_label, 16.0 / 9.0)
    v_ratio = parse_ratio(v_label, 9.0 / 16.0)

    all_file_paths = []
    for p_str in local_paths:
        p = Path(p_str)
        if p.is_dir():
            collected = collect_image_paths(p_str, recursive=True)
            all_file_paths.extend(collected)
        else:
            all_file_paths.append(p_str)

    items = []
    for p_str in all_file_paths:
        p = Path(p_str)
        filename = p.name
        if not p.exists() or not p.is_file():
            items.append(
                ImageValidationItem(
                    local_path=p_str,
                    filename=filename,
                    is_valid=False,
                    error="File not found or is not a file",
                    is_duplicate=False,
                )
            )
            continue

        try:
            phash = None
            with tempfile.NamedTemporaryFile(suffix=p.suffix, delete=False) as tmp:
                tmp_path = Path(tmp.name)
            try:
                ok, final_tmp_str = process_image(
                    str(p),
                    str(tmp_path),
                    auto_orient=True,
                    sort_output=False,
                    vert_ar=v_ratio,
                    horz_ar=h_ratio,
                    horz_label=h_label,
                    vert_label=v_label,
                )
                if ok:
                    final_tmp_path = Path(final_tmp_str)
                    try:
                        phash = calculate_phash(final_tmp_path)
                    finally:
                        final_tmp_path.unlink(missing_ok=True)
                else:
                    phash = calculate_phash(p)
            finally:
                tmp_path.unlink(missing_ok=True)

            if not phash:
                items.append(
                    ImageValidationItem(
                        local_path=p_str,
                        filename=filename,
                        is_valid=False,
                        error="Could not compute phash (invalid image file?)",
                        is_duplicate=False,
                    )
                )
                continue

            stmt = (
                select(ImageModel)
                .where(ImageModel.phash == phash)
                .options(
                    selectinload(ImageModel.set).selectinload(SetModel.creators)
                )
            )
            res = await db.execute(stmt)
            existing_img = res.scalars().first()

            if existing_img:
                creator_names = (
                    [c.canonical_name for c in existing_img.set.creators]
                    if existing_img.set
                    else []
                )
                set_title = (
                    existing_img.set.title if existing_img.set else "Unknown"
                )
                items.append(
                    ImageValidationItem(
                        local_path=p_str,
                        filename=filename,
                        is_valid=True,
                        phash=phash,
                        is_duplicate=True,
                        existing_image_id=existing_img.id,
                        existing_set_title=set_title,
                        existing_creator_names=creator_names,
                    )
                )
            else:
                items.append(
                    ImageValidationItem(
                        local_path=p_str,
                        filename=filename,
                        is_valid=True,
                        phash=phash,
                        is_duplicate=False,
                    )
                )
        except Exception as e:
            logger.exception("Error validating file", path=p_str, error=str(e))
            items.append(
                ImageValidationItem(
                    local_path=p_str,
                    filename=filename,
                    is_valid=False,
                    error=str(e),
                    is_duplicate=False,
                )
            )
    return ImageImportValidationResponse(items=items)


async def import_images_background_task(
    request_data: dict,
    task_id: str,
    db: Optional[AsyncSession] = None,
) -> None:
    """Asynchronous background task to process and import multiple images/folders into the vault."""
    if db is not None:
        await _import_images_background_task_impl(db, request_data, task_id)
    else:
        from app.services import import_service
        session_factory = getattr(import_service, "SessionLocal", SessionLocal)
        async with session_factory() as session:
            await _import_images_background_task_impl(session, request_data, task_id)


async def _import_images_background_task_impl(
    db: AsyncSession,
    request_data: dict,
    task_id: str,
) -> None:
    try:
        creator_name = request_data.get("creator_name")
        set_title = request_data.get("set_title")
        set_id = request_data.get("set_id")
        global_tags = request_data.get("tags") or []
        global_rating = request_data.get("rating") or "questionable"
        delete_source = request_data.get("delete_source") or False
        items = request_data.get("items") or []
        parent_dirs = set()

        req_lp_id = request_data.get("library_path_id")
        vault_root, target_lp_id = await resolve_vault_root(
            db, int(req_lp_id) if req_lp_id else None
        )

        h_label, v_label = await get_aspect_ratio_labels(db)
        h_ratio = parse_ratio(h_label, 16.0 / 9.0)
        v_ratio = parse_ratio(v_label, 9.0 / 16.0)

        ai_config = await get_ai_tagging_config(db)

        db_creators = []
        if creator_name:
            raw_names = re.split(r"\s*[\&＆,/+]\s*", creator_name)
            creator_names = [n.strip() for n in raw_names if n.strip()]
            for name in creator_names:
                c = await get_creator_by_name(db, name)
                if not c:
                    c = await create_creator(db, CreatorCreate(canonical_name=name))
                db_creators.append(c)

        joined_creators = (
            " & ".join([c.canonical_name for c in db_creators])
            if db_creators
            else "Unknown"
        )

        db_set = None
        if set_id:
            stmt = (
                select(SetModel)
                .where(SetModel.id == set_id)
                .options(
                    selectinload(SetModel.creators),
                    selectinload(SetModel.images),
                    selectinload(SetModel.tags),
                    selectinload(SetModel.characters),
                )
            )
            res = await db.execute(stmt)
            db_set = res.scalars().first()
        elif set_title:
            if db_creators:
                from app.crud.set import get_set_by_title_and_creators

                creator_ids = [c.id for c in db_creators]
                db_set = await get_set_by_title_and_creators(
                    db, set_title, creator_ids, load_relations=True
                )
            else:
                stmt = (
                    select(SetModel)
                    .where(SetModel.title == set_title)
                    .options(
                        selectinload(SetModel.creators),
                        selectinload(SetModel.images),
                        selectinload(SetModel.tags),
                        selectinload(SetModel.characters),
                    )
                )
                res = await db.execute(stmt)
                db_set = res.scalars().first()

            if not db_set:
                folder_name = sanitize_filename(f"{joined_creators} - {set_title}")
                dest_dir = vault_root / folder_name
                dest_dir.mkdir(parents=True, exist_ok=True)
                db_set = SetModel(
                    title=set_title,
                    local_path=os.path.normpath(str(dest_dir.resolve())),
                    library_path_id=target_lp_id,
                )
                db_set.creators = db_creators
                db_set.images = []
                db_set.tags = []
                db_set.characters = []
                db.add(db_set)
                await db.flush()
        else:
            stmt = (
                select(SetModel)
                .where(SetModel.title == "Imports")
                .options(
                    selectinload(SetModel.creators),
                    selectinload(SetModel.images),
                    selectinload(SetModel.tags),
                    selectinload(SetModel.characters),
                )
            )
            res = await db.execute(stmt)
            db_set = res.scalars().first()
            if not db_set:
                dest_dir = vault_root / "Imports"
                dest_dir.mkdir(parents=True, exist_ok=True)
                db_set = SetModel(
                    title="Imports",
                    local_path=os.path.normpath(str(dest_dir.resolve())),
                    library_path_id=target_lp_id,
                )
                db_set.creators = []
                db_set.images = []
                db_set.tags = []
                db_set.characters = []
                db.add(db_set)
                await db.flush()

        dest_dir = Path(db_set.local_path)
        dest_dir.mkdir(parents=True, exist_ok=True)

        all_import_files = []
        for item in items:
            item_path_str = item.get("local_path")
            item_path = Path(item_path_str)
            item_rating = item.get("rating") or global_rating
            item_tags = item.get("tags") or []

            if item_path.is_dir():
                collected = collect_image_paths(item_path_str, recursive=True)
                for f_path in collected:
                    f_p = Path(f_path)
                    all_import_files.append(
                        {
                            "source_path": f_path,
                            "filename": f_p.name,
                            "rating": item_rating,
                            "tags": item_tags,
                            "is_dir_child": True,
                            "dir_root": item_path_str,
                        }
                    )
            else:
                filename_override = item.get("filename") or item_path.name
                all_import_files.append(
                    {
                        "source_path": item_path_str,
                        "filename": filename_override,
                        "rating": item_rating,
                        "tags": item_tags,
                        "is_dir_child": False,
                    }
                )

        total_files = len(all_import_files)
        logger.info(
            "Starting background import of images",
            total_files=total_files,
            set_title=_safe_log_val(db_set.title),
        )

        await tasks.update_task(
            db, task_id, status="processing", progress=0, total=total_files
        )

        db_images = []
        all_detected_characters = set()

        for idx, file_info in enumerate(all_import_files):
            src_path = file_info["source_path"]
            filename = file_info["filename"]
            rating_str = file_info["rating"]
            item_tags = file_info["tags"] or []

            p = Path(src_path)
            if not p.exists() or not p.is_file():
                logger.warning("Source image not found, skipping", path=src_path)
                continue

            base_out = dest_dir / filename

            ok, final_p_str = process_image(
                src_path,
                str(base_out),
                auto_orient=True,
                sort_output=False,
                horz_ar=h_ratio,
                vert_ar=v_ratio,
                horz_label=h_label,
                vert_label=v_label,
            )

            if ok:
                final_p = Path(final_p_str)
                img_data = load_image(final_p_str)
                if img_data is not None:
                    h, w = img_data.shape[:2]
                    ratio_label = (
                        h_label
                        if final_p.name.startswith(f"{h_label}.")
                        else v_label
                    )

                    fx, fy = compute_focal_point(img_data)

                    image_tags_set = set(global_tags)
                    if item_tags:
                        image_tags_set.update(item_tags)

                    ai_tags, ai_chars = await tag_image_file(
                        db, ai_config, final_p_str, all_detected_characters
                    )
                    if ai_tags:
                        image_tags_set.update(t.name for t in ai_tags)

                    image_tag_objects = (
                        await get_tags_by_names(db, list(image_tags_set))
                        if image_tags_set
                        else []
                    )

                    rating_val = ImageRating.QUESTIONABLE
                    if rating_str.lower() == "safe":
                        rating_val = ImageRating.SAFE
                    elif rating_str.lower() == "explicit":
                        rating_val = ImageRating.EXPLICIT

                    dom_color_single = calculate_dominant_color(final_p)
                    db_img = ImageModel(
                        filename=final_p.name,
                        local_path=str(final_p.resolve()),
                        width=w,
                        height=h,
                        file_size=final_p.stat().st_size,
                        aspect_ratio=float(w) / float(h) if h != 0 else 0,
                        aspect_ratio_label=ratio_label,
                        phash=calculate_phash(final_p),
                        dominant_color=dom_color_single,
                        dominant_color_bucket=get_color_bucket(
                            dom_color_single
                        ),
                        rating=rating_val,
                        focal_point_x=fx,
                        focal_point_y=fy,
                        tags=image_tag_objects,
                    )
                    db_set.images.append(db_img)
                    db_images.append(db_img)

            if delete_source:
                deleted, err = await retry_delete(p, False)
                if deleted:
                    parent_dirs.add(p.parent)
                else:
                    logger.error(
                        "Failed to delete source file after retries due to lock",
                        path=src_path,
                        error=err,
                    )

            await tasks.update_task(
                db, task_id, progress=idx + 1, total=total_files
            )

        cleanup_warnings = []
        if delete_source:
            dropped_dirs = set(
                item["dir_root"]
                for item in all_import_files
                if item.get("is_dir_child") and item.get("dir_root")
            )
            items_paths = [
                item["local_path"] for item in items if item.get("local_path")
            ]
            cleanup_warnings = await cleanup_source_directories(
                dropped_dirs, items_paths, parent_dirs, vault_root
            )

        await apply_set_tag_rollups(
            db,
            db_set,
            db_images,
            all_detected_characters,
            ai_config["rollup_threshold"],
        )

        db.add(db_set)
        await db.commit()

        warning_msg = None
        if cleanup_warnings:
            folders_str = ", ".join(f"'{f}'" for f in cleanup_warnings)
            warning_msg = f"Source folder(s) {folders_str} still contained files and were left on disk."

        await tasks.update_task(
            db,
            task_id,
            status="completed",
            progress=total_files,
            total=total_files,
            error_message=warning_msg,
        )
        logger.info(
            "Background import of images completed successfully",
            task_id=task_id,
        )

    except Exception as e:
        logger.exception(
            "Error during background import", task_id=task_id, error=str(e)
        )
        await db.rollback()
        await tasks.update_task(
            db, task_id, status="error", error_message=str(e)
        )


async def batch_import_sets(
    db: AsyncSession, batch_in: BatchImportRequest, task_id: Optional[str] = None
) -> BatchImportResponse:
    """Executes a batch import process for multiple folders."""
    candidates = await gather_candidates(db, batch_in)
    regex = compile_parsing_regex(batch_in.parsing_template)
    results = await parse_and_validate_candidates(db, candidates, regex)

    if batch_in.dry_run:
        return BatchImportResponse(items=results)

    try:
        vault_root, _ = await resolve_vault_root(db)
    except Exception as e:
        raise HTTPException(
            status_code=400, detail="No library storage path configured"
        ) from e

    h_label, v_label = await get_aspect_ratio_labels(db)
    h_ratio = parse_ratio(h_label, 16.0 / 9.0)
    v_ratio = parse_ratio(v_label, 9.0 / 16.0)

    total_images = 0
    for item in results:
        if item.is_valid:
            try:
                img_paths = collect_image_paths(
                    item.source_path, recursive=True
                )
                total_images += len(img_paths)
            except Exception as e:
                logger.error(
                    "Failed to collect image paths during pre-scan",
                    path=item.source_path,
                    error=str(e),
                )

    progress_state = {"processed": 0, "total": total_images}
    if task_id:
        await tasks.update_task(db, task_id, progress=0, total=total_images)

    final_results = []
    for item in results:
        processed_item = await execute_import_item(
            db=db,
            item=item,
            vault_root=vault_root,
            h_ratio=h_ratio,
            v_ratio=v_ratio,
            h_label=h_label,
            v_label=v_label,
            delete_source_default=batch_in.delete_source_default,
            task_id=task_id,
            progress_state=progress_state,
        )
        final_results.append(processed_item)

    cleanup_warnings = []
    if batch_in.delete_source_default:
        for item in batch_in.items:
            source_p = Path(item.source_path)
            if source_p.exists() and source_p.is_dir():
                try:
                    if delete_dir_if_empty(source_p):
                        logger.info(
                            "Deleted empty batch source directory",
                            path=item.source_path,
                        )
                    else:
                        cleanup_warnings.append(source_p.name)
                        logger.info(
                            "Batch source directory not empty, leaving on disk",
                            path=item.source_path,
                        )
                except Exception as err:
                    logger.error(
                        "Failed to delete empty batch source directory",
                        path=item.source_path,
                        error=str(err),
                    )

    await db.flush()
    if task_id:
        await tasks.update_task(
            db,
            task_id,
            progress=progress_state["processed"],
            total=total_images,
        )

    response = BatchImportResponse(items=final_results)
    response.cleanup_warnings = cleanup_warnings
    return response


async def run_batch_import_background(
    batch_in: BatchImportRequest, task_id: str
) -> None:
    """Entry point for running batch imports as a background task."""
    async with SessionLocal() as db:
        try:
            await tasks.update_task(db, task_id, status=TaskStatus.PROCESSING)
            response = await batch_import_sets(db, batch_in, task_id=task_id)
            await db.commit()

            warning_msg = None
            warnings = getattr(response, "cleanup_warnings", [])
            if warnings:
                folders_str = ", ".join(f"'{f}'" for f in warnings)
                warning_msg = f"Source folder(s) {folders_str} still contained files and were left on disk."

            await tasks.update_task(
                db, task_id, status=TaskStatus.COMPLETED, error_message=warning_msg
            )
        except Exception as e:
            logger.exception("Batch import background task failed", error=str(e))
            await db.rollback()
            await tasks.update_task(
                db, task_id, status=TaskStatus.ERROR, error_message=str(e)
            )
