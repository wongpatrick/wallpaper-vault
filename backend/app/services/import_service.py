import re
import shutil
import cv2
import os
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.set import BatchImportRequest, BatchImportItem, BatchImportResponse
from app.crud.settings import get_setting
from app.crud.creator import get_creator_by_name, create_creator
from app.schemas.creator import CreatorCreate
from app.models.image import Image
from app.models.set import Set
from app.core.crop import collect_image_paths, process_image, load_image
from app.core.utils import sanitize_filename
from app.core import tasks

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
        print(f"Error compiling template: {e}")
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
        isValid = True
        
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
                    isValid = False
            else:
                isValid = False

        item_result = BatchImportItem(
            source_path=path,
            creator_name=creator or "Unknown",
            set_title=title or "Unknown",
            isValid=isValid,
            status="pending"
        )
        
        if isValid and creator and title:
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
    if not item.isValid:
        item.status = "error"
        item.error = "Invalid parsing"
        return item
        
    try:
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
                    
                    db_images.append(Image(
                        filename=final_p.name,
                        local_path=str(final_p.resolve()),
                        width=w, height=h,
                        file_size=final_p.stat().st_size,
                        aspect_ratio=float(w)/float(h) if h!=0 else 0,
                        aspect_ratio_label=ratio_label
                    ))
        
        # 5. Create Set
        db_set = Set(title=item.set_title, local_path=os.path.normpath(str(dest_dir.resolve())))
        db_set.creators = db_creators
        db_set.images = db_images
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
