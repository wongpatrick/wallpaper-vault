"""
Service for importing new sets and images into the vault.
Handles folder parsing, validation, and batch execution of media imports.
"""
import re
import shutil
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

logger = structlog.get_logger(__name__)

def _safe_log_val(val):
    """Recursively convert strings to ASCII backslash-replaced representation to prevent UnicodeEncodeError in console."""
    if isinstance(val, str):
        return val.encode('ascii', 'backslashreplace').decode('ascii')
    elif isinstance(val, list):
        return [_safe_log_val(x) for x in val]
    elif isinstance(val, dict):
        return {_safe_log_val(k): _safe_log_val(v) for k, v in val.items()}
    return val


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
        # If user provides a raw regex with named groups, use it directly
        if "(?P<creator" in template or "(?P<set" in template:
            return re.compile(template)
        
        # Support multiple [Creator] or [Set] tags by indexing them
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
    from app.crud.set import get_set_by_title_and_creator
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
            
            for cname in creator_names:
                c = await get_creator_by_name(db, cname)
                if c:
                    existing = await get_set_by_title_and_creator(db, item_result.set_title, c.id)
                    if existing:
                        item_result.status = "duplicate"
                        item_result.error = "Already in vault"
                        break
        
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
    delete_source_default: bool
) -> BatchImportItem:
    """Phase 3: Process images and save to database for a single item."""
    from app.crud.set import get_set_by_title_and_creator
    if not item.is_valid:
        item.status = "error"
        item.error = "Invalid parsing"
        return item
        
    try:
        # Load AI auto-tagging settings
        auto_tag_setting = await get_setting(db, "ai_auto_tag_enabled")
        auto_tag_enabled = auto_tag_setting.value.lower() in ("true", "1", "yes") if auto_tag_setting and auto_tag_setting.value else False

        model_type_setting = await get_setting(db, "ai_model_type")
        model_type = model_type_setting.value if model_type_setting and model_type_setting.value else "wd14_onnx"

        confidence_setting = await get_setting(db, "ai_confidence_threshold")
        try:
            confidence_threshold = float(confidence_setting.value) if confidence_setting and confidence_setting.value else 0.35
        except (ValueError, TypeError):
            confidence_threshold = 0.35

        rollup_threshold_setting = await get_setting(db, "ai_rollup_threshold")
        try:
            rollup_threshold = float(rollup_threshold_setting.value) if rollup_threshold_setting and rollup_threshold_setting.value else 0.3
        except (ValueError, TypeError):
            rollup_threshold = 0.3

        logger.info("Executing import item with AI auto-tagging config", 
                    set_title=_safe_log_val(item.set_title), 
                    auto_tag_enabled=auto_tag_enabled, 
                    model_type=_safe_log_val(model_type), 
                    confidence_threshold=confidence_threshold, 
                    rollup_threshold=rollup_threshold)

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
        is_duplicate = False
        for c in db_creators:
            existing = await get_set_by_title_and_creator(db, item.set_title, c.id)
            if existing:
                is_duplicate = True
                break
        
        if is_duplicate:
            item.status = "error"
            item.error = "Set already exists for one or more creators"
            return item

        # 4. Process Images
        image_paths = collect_image_paths(item.source_path, recursive=True)
        db_images = []
        all_detected_characters = set()
        
        tagger = None
        if auto_tag_enabled:
            from app.services.ai_tagging import get_tagger
            tagger = get_tagger(model_type)

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
                    
                    # Auto tagging if enabled
                    image_tags_list = []
                    if auto_tag_enabled and tagger:
                        try:
                            import asyncio
                            logger.info("Running AI auto-tagging on image", path=_safe_log_val(final_p_str), model=_safe_log_val(model_type), confidence_threshold=confidence_threshold)
                            general_tags, character_tags = await asyncio.to_thread(
                                tagger.tag_image, 
                                final_p_str, 
                                threshold=confidence_threshold
                            )
                            # Record detected characters for Set association
                            if character_tags:
                                for char_name in character_tags:
                                    all_detected_characters.add(char_name)

                            logger.info("AI tagging completed for image", path=_safe_log_val(final_p_str), general_tags=_safe_log_val(general_tags), character_tags=_safe_log_val(character_tags), total_suggested=(len(general_tags) + len(character_tags)))
                            
                            # Resolve general tags as Image tags (prevents namespace conflicts with characters table)
                            if general_tags:
                                from app.crud.tag import get_tags_by_names
                                image_tags_list = await get_tags_by_names(db, general_tags)
                                logger.info("Associated tags to image record", path=_safe_log_val(final_p_str), count=len(image_tags_list), tags=[_safe_log_val(t.name) for t in image_tags_list])
                        except Exception as tag_err:
                            logger.error("Failed to run AI tagging", path=_safe_log_val(final_p_str), error=_safe_log_val(str(tag_err)))

                    # Create image model and assign tags in the constructor
                    # This avoids triggering lazy loading (MissingGreenlet) on transient objects.
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
                        tags=image_tags_list
                    ))
        
        # 5. Create Set
        db_set = Set(title=item.set_title, local_path=os.path.normpath(str(dest_dir.resolve())))
        db_set.creators = db_creators
        db_set.images = db_images
        
        # Resolve and associate character tags to the Set
        if all_detected_characters:
            from app.crud.character import get_characters_by_names
            logger.info("Resolving AI character tags for Set", set_title=_safe_log_val(item.set_title), characters=_safe_log_val(list(all_detected_characters)))
            db_characters = await get_characters_by_names(db, list(all_detected_characters))
            db_set.characters = list(db_characters)
        
        # 30% dynamic rollup threshold to add frequent tags to the Set
        if db_images:
            tag_counts = {}
            tag_objects = {}
            for img in db_images:
                for t in img.tags:
                    tag_counts[t.name] = tag_counts.get(t.name, 0) + 1
                    tag_objects[t.name] = t
            
            logger.info("Computing Set rollup tags", set_title=_safe_log_val(item.set_title), total_images=len(db_images), tag_frequencies=_safe_log_val({name: f"{count}/{len(db_images)}" for name, count in tag_counts.items()}))

            rollup_tags = []
            num_images = len(db_images)
            for tag_name, count in tag_counts.items():
                freq = float(count) / num_images
                if freq >= rollup_threshold:
                    logger.info("Promoting tag to Set level", set_title=_safe_log_val(item.set_title), tag_name=_safe_log_val(tag_name), frequency=f"{freq:.2%}", required=f"{rollup_threshold:.2%}")
                    rollup_tags.append(tag_objects[tag_name])
            
            db_set.tags = rollup_tags

        db.add(db_set)
        
        # Cleanup
        if delete_source_default:
            source_p = Path(item.source_path)
            if source_p.is_dir(): 
                shutil.rmtree(source_p)
            else: 
                source_p.unlink()

        item.status = "success"
    except Exception as e:
        item.status = "error"
        item.error = str(e)
    
    return item
