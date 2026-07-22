"""
Service for importing new sets and images into the vault.
Handles folder parsing, validation, and batch execution of media imports.
"""
from typing import Any
import re
import os
from pathlib import Path
import structlog

from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.set import BatchImportRequest, BatchImportItem
from app.crud.settings import get_setting
from app.crud.creator import get_creator_by_name, create_creator
from app.schemas.creator import CreatorCreate
from app.models.image import Image
from app.models.set import Set
from app.core.crop import collect_image_paths, process_image, load_image, compute_focal_point
from app.core.utils import sanitize_filename

# Re-export extracted file system utilities for backward compatibility
from app.services.file_service import (
    safe_log_val as _safe_log_val,
    safe_log_val,
    retry_delete_sync as _retry_delete,
    retry_delete_sync,
    retry_delete,
    delete_dir_if_empty,
    delete_dir_if_empty_async,
    cleanup_source_directories
)

# Import AI tagging service utilities
from app.services.ai_tagging_service import (
    get_ai_tagging_config,
    tag_image_file,
    apply_set_tag_rollups
)

__all__ = [
    "safe_log_val",
    "_safe_log_val",
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
]

logger = structlog.get_logger(__name__)


async def gather_candidates(db: AsyncSession, batch_in: BatchImportRequest) -> list[dict]:
    """Phase 1: Gather potential folders for import."""
    candidates = []
    if batch_in.scan_auto_path:
        parse_setting = await get_setting(db, "auto_parse_path")
        if parse_setting and parse_setting.value:
            scan_root = Path(parse_setting.value)
            if scan_root.exists() and scan_root.is_dir():
                for item in scan_root.iterdir():
                    if item.is_dir():
                        candidates.append({
                            "path": str(item.resolve()),
                            "name": item.name
                        })
    
    for item in batch_in.items:
        candidates.append({
            "path": item.source_path,
            "name": Path(item.source_path).name,
            "creator_name": item.creator_name,
            "set_title": item.set_title,
            "delete_source": item.delete_source,
            "auto_orient": item.auto_orient
        })
    return candidates


def compile_parsing_regex(template: str) -> re.Pattern | None:
    """Helper to compile user-provided templates into regex."""
    if not template:
        return None
    try:
        if "(?P<creator" in template or "(?P<set" in template:
            return re.compile(template)
        
        pattern = re.escape(template)
        for tag, group_prefix in [("\\[Creator\\]", "creator"), ("\\[Set\\]", "set")]:
            count = 0
            while tag in pattern:
                pattern = pattern.replace(tag, f"(?P<{group_prefix}_{count}>.+?)", 1)
                count += 1
        return re.compile(f"^{pattern}$")
    except Exception as e:
        logger.error("Error compiling template", error=str(e), exc_info=True)
        return None


async def parse_and_validate_candidates(
    db: AsyncSession, 
    candidates: list[dict], 
    regex: re.Pattern | None
) -> list[BatchImportItem]:
    """Phase 2: Parse folder names and validate against existing records."""
    from app.crud.set import get_set_by_title_and_creators
    results = []
    for cand in candidates:
        path = cand["path"]
        name = cand["name"]
        creator = cand.get("creator_name")
        title = cand.get("set_title")
        is_valid = True
        
        if not creator or not title:
            if regex:
                m = regex.match(name)
                if m:
                    c_parts = [v for k, v in m.groupdict().items() if k.startswith("creator_") and v]
                    if c_parts:
                        creator = creator or " & ".join([p.strip() for p in c_parts])
                    elif "creator" in m.groupdict():
                        creator = creator or m.group("creator")
                        
                    s_parts = [v for k, v in m.groupdict().items() if k.startswith("set_") and v]
                    if s_parts:
                        title = title or " ".join([p.strip() for p in s_parts])
                    elif "set" in m.groupdict():
                        title = title or m.group("set")
                else:
                    is_valid = False
            else:
                is_valid = False

        item_result = BatchImportItem(
            source_path=path,
            creator_name=creator or "Unknown",
            set_title=title or "Unknown",
            is_valid=is_valid,
            status="pending"
        )
        
        if is_valid and creator and title:
            raw_names = re.split(r'\s+&\s+', item_result.creator_name)
            creator_names = [n.strip() for n in raw_names if n.strip()]
            
            creator_ids = []
            all_resolved = True
            for cname in creator_names:
                c = await get_creator_by_name(db, cname)
                if c:
                    creator_ids.append(c.id)
                else:
                    all_resolved = False
            
            if all_resolved and len(creator_ids) == len(creator_names):
                existing = await get_set_by_title_and_creators(db, item_result.set_title, creator_ids, load_relations=False)
                if existing:
                    item_result.status = "duplicate"
                    item_result.error = "Already in vault"
        
        results.append(item_result)
    return results


async def execute_import_item(
    db: AsyncSession,
    item: BatchImportItem,
    vault_root: Path,
    h_ratio: float,
    v_ratio: float,
    h_label: str,
    v_label: str,
    delete_source_default: bool,
    task_id: str = None,
    progress_state: dict = None
) -> BatchImportItem:
    """Phase 3: Process images and save to database for a single item."""
    from app.crud.set import get_set_by_title_and_creators
    if not item.is_valid:
        item.status = "error"
        item.error = "Invalid parsing"
        return item
        
    try:
        # Load AI auto-tagging config
        ai_config = await get_ai_tagging_config(db)

        logger.info("Executing import item with AI auto-tagging config", 
                    set_title=_safe_log_val(item.set_title), 
                    auto_tag_enabled=ai_config["enabled"], 
                    model_type=_safe_log_val(ai_config["model_type"]), 
                    confidence_threshold=ai_config["confidence_threshold"], 
                    rollup_threshold=ai_config["rollup_threshold"])

        # 1. Handle Multiple Creators
        raw_names = re.split(r'\s+&\s+', item.creator_name)
        creator_names = [n.strip() for n in raw_names if n.strip()]
        if not creator_names:
            creator_names = [item.creator_name.strip()] if item.creator_name.strip() else ["Unknown"]
        
        db_creators = []
        for name in creator_names:
            c = await get_creator_by_name(db, name)
            if not c:
                c = await create_creator(db, CreatorCreate(canonical_name=name))
            db_creators.append(c)

        joined_creators = " & ".join([c.canonical_name for c in db_creators])
        
        # 2. Create destination (Sanitized)
        folder_name = sanitize_filename(f"{joined_creators} - {item.set_title}")
        dest_dir = vault_root / folder_name
        dest_dir.mkdir(parents=True, exist_ok=True)

        # 3. Existing Set Check
        creator_ids = [c.id for c in db_creators]
        existing = await get_set_by_title_and_creators(db, item.set_title, creator_ids, load_relations=False)
        
        if existing:
            item.status = "error"
            item.error = "Set already exists for these creators"
            if progress_state and task_id:
                image_paths = collect_image_paths(item.source_path, recursive=True)
                progress_state["processed"] += len(image_paths)
                from app.core import tasks
                await tasks.update_task(db, task_id, progress=progress_state["processed"], total=progress_state["total"])
            return item

        # 4. Process Images
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
                    vert_label=v_label
                )
                
                if ok:
                    final_p = Path(final_p_str)
                    img_data = load_image(final_p_str)
                    if img_data is not None:
                        h, w = img_data.shape[:2]
                        ratio_label = h_label if final_p.name.startswith(f"{h_label}.") else v_label
                        
                        from app.core.enums import ImageRating
                        from app.services.audit_service import calculate_phash, calculate_dominant_color
                        
                        fx, fy = compute_focal_point(img_data)
                        
                        # Auto tagging via AI service
                        image_tags_list, image_characters_list = await tag_image_file(
                            db, ai_config, final_p_str, all_detected_characters
                        )

                        # Create image model and assign tags
                        db_images.append(Image(
                            filename=final_p.name,
                            local_path=str(final_p.resolve()),
                            width=w, height=h,
                            file_size=final_p.stat().st_size,
                            aspect_ratio=float(w)/float(h) if h!=0 else 0,
                            aspect_ratio_label=ratio_label,
                            phash=calculate_phash(final_p),
                            dominant_color=calculate_dominant_color(final_p),
                            rating=ImageRating.QUESTIONABLE,
                            focal_point_x=fx,
                            focal_point_y=fy,
                            tags=image_tags_list,
                            characters=image_characters_list
                        ))
                
                processed_in_item += 1
                if progress_state and task_id:
                    progress_state["processed"] += 1
                    from app.core import tasks
                    await tasks.update_task(db, task_id, progress=progress_state["processed"], total=progress_state["total"])
        except Exception as process_err:
            unprocessed = len(image_paths) - processed_in_item
            if unprocessed > 0 and progress_state and task_id:
                progress_state["processed"] += unprocessed
                from app.core import tasks
                await tasks.update_task(db, task_id, progress=progress_state["processed"], total=progress_state["total"])
            raise process_err
        
        # 5. Create Set
        db_set = Set(title=item.set_title, local_path=os.path.normpath(str(dest_dir.resolve())))
        db_set.creators = db_creators
        db_set.images = db_images
        
        # Apply AI character associations and tag rollups
        await apply_set_tag_rollups(
            db, db_set, db_images, all_detected_characters, ai_config["rollup_threshold"]
        )

        db.add(db_set)
        
        # Cleanup
        if delete_source_default:
            source_p = Path(item.source_path)
            is_dir = source_p.is_dir()
            deleted, err = await retry_delete(source_p, is_dir)
            if not deleted:
                if is_dir:
                    logger.error("Failed to delete batch source directory after retries due to lock", path=item.source_path, error=err)
                else:
                    logger.error("Failed to delete batch source file after retries due to lock", path=item.source_path, error=err)
            elif not is_dir:
                # Clean up empty parent directory if empty
                parent = source_p.parent
                try:
                    if await delete_dir_if_empty_async(parent):
                        logger.info("Deleted empty source directory", path=str(parent))
                except Exception as dir_err:
                    logger.error("Failed to delete empty source directory", path=str(parent), error=str(dir_err))

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
                    from app.core import tasks
                    await tasks.update_task(db, task_id, progress=progress_state["processed"], total=progress_state["total"])
            except Exception:
                pass
    
    return item


async def validate_local_paths(db: AsyncSession, local_paths: list[str]) -> Any:
    """Recursively validates local paths (files or folders) for import and detects visual duplicates."""
    from app.schemas.image import ImageImportValidationResponse, ImageValidationItem
    from app.services.audit_service import calculate_phash
    from app.models.image import Image as ImageModel
    from app.models.set import Set as SetModel
    from sqlalchemy.orm import selectinload
    from sqlalchemy import select
    from app.core.crop import process_image
    import tempfile
    
    h_ratio_setting = await get_setting(db, "horizontal_target_ratio")
    v_ratio_setting = await get_setting(db, "vertical_target_ratio")
    h_label_raw = h_ratio_setting.value if h_ratio_setting else "16/9"
    v_label_raw = v_ratio_setting.value if v_ratio_setting else "9/16"

    def parse_ratio(r_str: str, default: float) -> float:
        try:
            if "/" in r_str:
                num, den = r_str.split("/")
                return float(num) / float(den)
            return float(r_str)
        except (ValueError, TypeError):
            return default

    h_ratio = parse_ratio(h_label_raw, 16.0/9.0)
    v_ratio = parse_ratio(v_label_raw, 9.0/16.0)
    h_label = h_label_raw.replace("/", "x")
    v_label = v_label_raw.replace("/", "x")
    
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
            items.append(ImageValidationItem(
                local_path=p_str,
                filename=filename,
                is_valid=False,
                error="File not found or is not a file",
                is_duplicate=False
            ))
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
                    vert_label=v_label
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
                items.append(ImageValidationItem(
                    local_path=p_str,
                    filename=filename,
                    is_valid=False,
                    error="Could not compute phash (invalid image file?)",
                    is_duplicate=False
                ))
                continue
                
            stmt = (
                select(ImageModel)
                .where(ImageModel.phash == phash)
                .options(selectinload(ImageModel.set).selectinload(SetModel.creators))
            )
            res = await db.execute(stmt)
            existing_img = res.scalars().first()
            
            if existing_img:
                creator_names = [c.canonical_name for c in existing_img.set.creators] if existing_img.set else []
                set_title = existing_img.set.title if existing_img.set else "Unknown"
                items.append(ImageValidationItem(
                    local_path=p_str,
                    filename=filename,
                    is_valid=True,
                    phash=phash,
                    is_duplicate=True,
                    existing_image_id=existing_img.id,
                    existing_set_title=set_title,
                    existing_creator_names=creator_names
                ))
            else:
                items.append(ImageValidationItem(
                    local_path=p_str,
                    filename=filename,
                    is_valid=True,
                    phash=phash,
                    is_duplicate=False
                ))
        except Exception as e:
            logger.exception("Error validating file", path=p_str, error=str(e))
            items.append(ImageValidationItem(
                local_path=p_str,
                filename=filename,
                is_valid=False,
                error=str(e),
                is_duplicate=False
            ))
    return ImageImportValidationResponse(items=items)


async def import_images_background_task(
    db: AsyncSession,
    request_data: dict,
    task_id: str
) -> None:
    """Asynchronous background task to process and import multiple images/folders into the vault."""
    import sys
    created_session = False
    if "pytest" not in sys.modules:
        from app.db.session import SessionLocal
        db = SessionLocal()
        created_session = True
    from app.core import tasks
    from app.models.image import Image as ImageModel
    from app.models.set import Set as SetModel
    from app.crud.creator import get_creator_by_name, create_creator
    from app.schemas.creator import CreatorCreate
    from app.services.audit_service import calculate_phash, calculate_dominant_color
    from app.core.crop import process_image, compute_focal_point, load_image
    from app.core.enums import ImageRating
    from sqlalchemy import select
    
    try:
        creator_name = request_data.get("creator_name")
        set_title = request_data.get("set_title")
        set_id = request_data.get("set_id")
        global_tags = request_data.get("tags") or []
        global_rating = request_data.get("rating") or "questionable"
        delete_source = request_data.get("delete_source") or False
        items = request_data.get("items") or []
        parent_dirs = set()

        # Get base library path
        vault_setting = await get_setting(db, "base_library_path")
        if not vault_setting or not vault_setting.value:
            await tasks.update_task(db, task_id, status="error", error_message="base_library_path not configured")
            return
        vault_root = Path(vault_setting.value)

        # Get aspect ratios
        h_ratio_setting = await get_setting(db, "horizontal_target_ratio")
        v_ratio_setting = await get_setting(db, "vertical_target_ratio")
        h_label_raw = h_ratio_setting.value if h_ratio_setting else "16/9"
        v_label_raw = v_ratio_setting.value if v_ratio_setting else "9/16"

        def parse_ratio(r_str: str, default: float) -> float:
            try:
                if "/" in r_str:
                    num, den = r_str.split("/")
                    return float(num) / float(den)
                return float(r_str)
            except (ValueError, TypeError):
                return default

        h_ratio = parse_ratio(h_label_raw, 16.0/9.0)
        v_ratio = parse_ratio(v_label_raw, 9.0/16.0)
        h_label = h_label_raw.replace("/", "x")
        v_label = v_label_raw.replace("/", "x")

        # Load AI auto-tagging configuration
        ai_config = await get_ai_tagging_config(db)

        # 1. Resolve Creator(s)
        db_creators = []
        if creator_name:
            raw_names = re.split(r'\s+&\s+', creator_name)
            creator_names = [n.strip() for n in raw_names if n.strip()]
            for name in creator_names:
                c = await get_creator_by_name(db, name)
                if not c:
                    c = await create_creator(db, CreatorCreate(canonical_name=name))
                db_creators.append(c)

        joined_creators = " & ".join([c.canonical_name for c in db_creators]) if db_creators else "Unknown"

        # 2. Resolve target Set
        from sqlalchemy.orm import selectinload
        db_set = None
        if set_id:
            stmt = select(SetModel).where(SetModel.id == set_id).options(
                selectinload(SetModel.creators),
                selectinload(SetModel.images),
                selectinload(SetModel.tags),
                selectinload(SetModel.characters)
            )
            res = await db.execute(stmt)
            db_set = res.scalars().first()
        elif set_title:
            if db_creators:
                from app.crud.set import get_set_by_title_and_creators
                creator_ids = [c.id for c in db_creators]
                db_set = await get_set_by_title_and_creators(db, set_title, creator_ids, load_relations=True)
            else:
                stmt = select(SetModel).where(SetModel.title == set_title).options(
                    selectinload(SetModel.creators),
                    selectinload(SetModel.images),
                    selectinload(SetModel.tags),
                    selectinload(SetModel.characters)
                )
                res = await db.execute(stmt)
                db_set = res.scalars().first()

            if not db_set:
                folder_name = sanitize_filename(f"{joined_creators} - {set_title}")
                dest_dir = vault_root / folder_name
                dest_dir.mkdir(parents=True, exist_ok=True)
                db_set = SetModel(title=set_title, local_path=os.path.normpath(str(dest_dir.resolve())))
                db_set.creators = db_creators
                db_set.images = []
                db_set.tags = []
                db_set.characters = []
                db.add(db_set)
                await db.flush()
        else:
            stmt = select(SetModel).where(SetModel.title == "Imports").options(
                selectinload(SetModel.creators),
                selectinload(SetModel.images),
                selectinload(SetModel.tags),
                selectinload(SetModel.characters)
            )
            res = await db.execute(stmt)
            db_set = res.scalars().first()
            if not db_set:
                dest_dir = vault_root / "Imports"
                dest_dir.mkdir(parents=True, exist_ok=True)
                db_set = SetModel(title="Imports", local_path=os.path.normpath(str(dest_dir.resolve())))
                db_set.creators = []
                db_set.images = []
                db_set.tags = []
                db_set.characters = []
                db.add(db_set)
                await db.flush()

        dest_dir = Path(db_set.local_path)
        dest_dir.mkdir(parents=True, exist_ok=True)

        # 3. Collect individual image file paths to import
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
                    all_import_files.append({
                        "source_path": f_path,
                        "filename": f_p.name,
                        "rating": item_rating,
                        "tags": item_tags,
                        "is_dir_child": True,
                        "dir_root": item_path_str
                    })
            else:
                filename_override = item.get("filename") or item_path.name
                all_import_files.append({
                    "source_path": item_path_str,
                    "filename": filename_override,
                    "rating": item_rating,
                    "tags": item_tags,
                    "is_dir_child": False
                })

        total_files = len(all_import_files)
        logger.info("Starting background import of images", total_files=total_files, set_title=_safe_log_val(db_set.title))
        
        await tasks.update_task(db, task_id, status="processing", progress=0, total=total_files)

        db_images = []
        all_detected_characters = set()
        
        from app.crud.tag import get_tags_by_names

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
                vert_label=v_label
            )
            
            if ok:
                final_p = Path(final_p_str)
                img_data = load_image(final_p_str)
                if img_data is not None:
                    h, w = img_data.shape[:2]
                    ratio_label = h_label if final_p.name.startswith(f"{h_label}.") else v_label
                    
                    fx, fy = compute_focal_point(img_data)
                    
                    image_tags_set = set(global_tags)
                    if item_tags:
                        image_tags_set.update(item_tags)
                        
                    # Auto tagging via AI service
                    ai_tags, ai_chars = await tag_image_file(
                        db, ai_config, final_p_str, all_detected_characters
                    )
                    if ai_tags:
                        image_tags_set.update(t.name for t in ai_tags)
                            
                    image_tag_objects = await get_tags_by_names(db, list(image_tags_set)) if image_tags_set else []

                    rating_val = ImageRating.QUESTIONABLE
                    if rating_str.lower() == "safe":
                        rating_val = ImageRating.SAFE
                    elif rating_str.lower() == "explicit":
                        rating_val = ImageRating.EXPLICIT

                    db_img = ImageModel(
                        filename=final_p.name,
                        local_path=str(final_p.resolve()),
                        width=w, height=h,
                        file_size=final_p.stat().st_size,
                        aspect_ratio=float(w)/float(h) if h!=0 else 0,
                        aspect_ratio_label=ratio_label,
                        phash=calculate_phash(final_p),
                        dominant_color=calculate_dominant_color(final_p),
                        rating=rating_val,
                        focal_point_x=fx,
                        focal_point_y=fy,
                        tags=image_tag_objects
                    )
                    db_set.images.append(db_img)
                    db_images.append(db_img)
                    
            if delete_source:
                deleted, err = await retry_delete(p, False)
                if deleted:
                    parent_dirs.add(p.parent)
                else:
                    logger.error("Failed to delete source file after retries due to lock", path=src_path, error=err)
                    
            await tasks.update_task(db, task_id, progress=idx + 1, total=total_files)

        cleanup_warnings = []
        if delete_source:
            dropped_dirs = set(item["dir_root"] for item in all_import_files if item.get("is_dir_child") and item.get("dir_root"))
            items_paths = [item["local_path"] for item in items if item.get("local_path")]
            cleanup_warnings = await cleanup_source_directories(
                dropped_dirs, items_paths, parent_dirs, vault_root
            )

        # Apply AI character associations and tag rollups
        await apply_set_tag_rollups(
            db, db_set, db_images, all_detected_characters, ai_config["rollup_threshold"]
        )

        db.add(db_set)
        await db.commit()
        
        warning_msg = None
        if cleanup_warnings:
            folders_str = ", ".join(f"'{f}'" for f in cleanup_warnings)
            warning_msg = f"Source folder(s) {folders_str} still contained files and were left on disk."
        
        await tasks.update_task(db, task_id, status="completed", progress=total_files, total=total_files, error_message=warning_msg)
        logger.info("Background import of images completed successfully", task_id=task_id)
        
    except Exception as e:
        logger.exception("Error during background import", task_id=task_id, error=str(e))
        await db.rollback()
        await tasks.update_task(db, task_id, status="error", error_message=str(e))
    finally:
        if created_session:
            await db.close()
