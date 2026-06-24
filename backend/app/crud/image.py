"""
CRUD operations for image records, including duplicate detection and resolution.
"""
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from app.models.image import Image
from app.models.set import Set
from app.models.creator import Creator
from app.schemas.image import ImageUpdate, ImageCreate, ImageBulkUpdate
from app.core.enums import BulkOperationMode
from collections import defaultdict
import structlog

logger = structlog.get_logger(__name__)

async def get_random_image(
    db: AsyncSession, 
    tags: Optional[list[str]] = None, 
    aspect_ratio_label: Optional[str] = None,
    min_width: Optional[int] = None,
    min_height: Optional[int] = None,
    creator_id: Optional[int] = None,
    playlist_id: Optional[int] = None,
    rating: Optional[str] = None
) -> Optional[Image]:
    """Retrieves a single random image based on optional filters.

    Args:
        db: Database session.
        tags: Optional list of tags to filter by.
        aspect_ratio_label: Optional aspect ratio label (e.g., '16:9').
        min_width: Minimum image width in pixels.
        min_height: Minimum image height in pixels.
        creator_id: Optional creator ID to filter by.
        playlist_id: Optional playlist ID to filter by.
        rating: Optional rating to filter by.

    Returns:
        A random Image object matching the filters, or None if no match is found.
    """
    query = select(Image).join(Image.set)
    
    if tags:
        from app.models.tag import Tag
        for tag_str in tags:
            query = query.filter(Set.tags.any(Tag.name.icontains(tag_str)))
            
    if aspect_ratio_label:
        # Standardise formatting variations like '16:9', '16x9', '16/9'
        variations = {
            aspect_ratio_label,
            aspect_ratio_label.replace(":", "x"),
            aspect_ratio_label.replace("x", ":"),
            aspect_ratio_label.replace("/", "x"),
            aspect_ratio_label.replace("/", ":")
        }
        query = query.filter(Image.aspect_ratio_label.in_(variations))
        
    if min_width:
        query = query.filter(Image.width >= min_width)
        
    if min_height:
        query = query.filter(Image.height >= min_height)
        
    if creator_id:
        query = query.join(Set.creators).filter(Creator.id == creator_id)

    if playlist_id:
        from app.models.playlist import PlaylistImage
        query = query.join(Image.playlist_images).filter(PlaylistImage.playlist_id == playlist_id)

    if rating:
        query = query.filter(Image.rating == rating)

    query = query.order_by(func.random()).limit(1)
    
    result = await db.execute(query)
    return result.scalar_one_or_none()

async def get_image(db: AsyncSession, image_id: int) -> Optional[Image]:
    """Retrieves an image by its ID.

    Args:
        db: Database session.
        image_id: ID of the image to retrieve.

    Returns:
        The Image object if found, otherwise None.
    """
    result = await db.execute(
        select(Image)
        .options(selectinload(Image.tags))
        .filter(Image.id == image_id)
    )
    return result.scalar_one_or_none()

async def get_images_by_set(db: AsyncSession, set_id: int) -> list[Image]:
    """Retrieves all images associated with a specific set.

    Args:
        db: Database session.
        set_id: ID of the set.

    Returns:
        A list of Image objects belonging to the set, ordered by sort_order.
    """
    result = await db.execute(select(Image).filter(Image.set_id == set_id).order_by(Image.sort_order))
    return list(result.scalars().all())

async def create_image_db(db: AsyncSession, image_in: ImageCreate, set_id: int) -> Image:
    """Creates a new image record in the database directly.

    Args:
        db: Database session.
        image_in: Image creation schema containing processed image data.
        set_id: ID of the set this image belongs to.

    Returns:
        The newly created Image object.
    """
    db_image = Image(**image_in.model_dump(), set_id=set_id)
    db.add(db_image)
    await db.commit()
    await db.refresh(db_image)
    return db_image

async def update_image(db: AsyncSession, image_id: int, image_in: ImageUpdate) -> Optional[Image]:
    """Updates an existing image record.

    Args:
        db: Database session.
        image_id: ID of the image to update.
        image_in: Image update schema containing updated data.

    Returns:
        The updated Image object, or None if the image was not found.
    """
    db_image = await get_image(db, image_id)
    if not db_image:
        return None
    
    update_data = image_in.model_dump(exclude_unset=True, exclude={"tags"})
    for field in update_data:
        setattr(db_image, field, update_data[field])
        
    if image_in.tags is not None:
        from app.crud.tag import get_tags_by_names
        db_image.tags = await get_tags_by_names(db, image_in.tags)
    
    db.add(db_image)
    await db.commit()
    await db.refresh(db_image)
    
    if db_image.set_id:
        from app.crud.set import recalculate_set_rollup_tags
        await recalculate_set_rollup_tags(db, db_image.set_id)
        
    return await get_image(db, image_id)

async def bulk_update_images(db: AsyncSession, bulk_in: ImageBulkUpdate) -> int:
    """Performs a bulk update on multiple image records.

    Handles tag modifications according to the specified BulkOperationMode
    (APPEND, REMOVE, REPLACE) while ignoring immutable fields like filename or phash.

    Args:
        db: Database session.
        bulk_in: Bulk update schema containing target IDs and update data.

    Returns:
        The number of images successfully updated.
    """
    result = await db.execute(select(Image).where(Image.id.in_(bulk_in.image_ids)))
    db_images = result.scalars().all()
    
    if not db_images:
        return 0
    
    # We ignore 'filename' and 'local_path' for bulk updates
    update_fields = bulk_in.update_data.model_dump(
        exclude_unset=True, 
        exclude={"filename", "local_path", "phash", "width", "height", "file_size", "aspect_ratio", "aspect_ratio_label"}
    )
    
    for db_img in db_images:
        for field in update_fields:
            if bulk_in.operation_mode == BulkOperationMode.APPEND and field == "notes":
                current_notes = db_img.notes or ""
                new_notes = update_fields[field] or ""
                db_img.notes = f"{current_notes}\n{new_notes}".strip() if current_notes else new_notes
            elif bulk_in.operation_mode == BulkOperationMode.REMOVE and field == "notes":
                db_img.notes = None
            else:
                setattr(db_img, field, update_fields[field])
        db.add(db_img)
        
    await db.commit()
    return len(db_images)

async def delete_image_db(db: AsyncSession, image_id: int) -> Optional[Image]:
    """Deletes an image from the database.

    Args:
        db: Database session.
        image_id: ID of the image to delete.

    Returns:
        The deleted Image object, or None if it was not found.
    """
    db_image = await get_image(db, image_id)
    if db_image:
        set_id = db_image.set_id
        await db.delete(db_image)
        await db.commit()
        if set_id:
            from app.crud.set import recalculate_set_rollup_tags
            await recalculate_set_rollup_tags(db, set_id)
    return db_image

async def get_duplicate_groups(db: AsyncSession) -> list[dict]:
    """Identifies and groups images that share the same perceptual hash (phash).

    Args:
        db: Database session.

    Returns:
        A dictionary mapping a phash string to a list of duplicate Image objects.
    """
    # 1. Find phashe that appear more than once
    subquery = (
        select(Image.phash)
        .filter(Image.phash.is_not(None))
        .group_by(Image.phash)
        .having(func.count(Image.id) > 1)
    ).subquery()

    # 2. Get all images with those phashe, with set/creator context
    query = (
        select(Image)
        .join(subquery, Image.phash == subquery.c.phash)
        .options(
            selectinload(Image.set).selectinload(Set.creators)
        )
    )

    result = await db.execute(query)
    images = result.scalars().all()

    # 3. Group them in Python
    groups_dict = defaultdict(list)
    for img in images:
        groups_dict[img.phash].append(img)

    return groups_dict

async def get_color_stats(db: AsyncSession, tolerance: int = 30) -> list[dict]:
    """Aggregates images by dominant color buckets based on preset swatches.

    Args:
        db: Database session.
        tolerance: Color matching tolerance.

    Returns:
        A list of dictionaries with 'color' and 'count'.
    """
    result = await db.execute(select(Image.dominant_color).where(Image.dominant_color.is_not(None)))
    colors = result.scalars().all()
    
    preset_swatches = [
        '#E03131', '#E8590C', '#F08C00', '#2F9E44', '#0C8599',
        '#1971C2', '#6741D9', '#C2255C', '#F8F9FA', '#868E96', '#212529'
    ]
    
    counts = {swatch: 0 for swatch in preset_swatches}
    
    for c in colors:
        for swatch in preset_swatches:
            if _matches_color(c, swatch, hue_tolerance=tolerance):
                counts[swatch] += 1
                break
                
    return [{"color": k, "count": v} for k, v in counts.items() if v > 0]
def _hex_to_hsl(hex_color: str) -> tuple[float, float, float]:
    import colorsys
    hex_color = hex_color.lstrip('#')
    if len(hex_color) != 6:  # noqa: PLR2004
        return 0, 0, 0
    r = int(hex_color[0:2], 16) / 255.0  # noqa: PLR2004
    g = int(hex_color[2:4], 16) / 255.0  # noqa: PLR2004
    b = int(hex_color[4:6], 16) / 255.0  # noqa: PLR2004
    hue, light, sat = colorsys.rgb_to_hls(r, g, b)
    return hue * 360, sat * 100, light * 100  # noqa: PLR2004

def _matches_color(dominant_color: Optional[str], target_color: str, hue_tolerance: int = 30) -> bool:
    if not dominant_color:
        return False
    hue, sat, light = _hex_to_hsl(dominant_color)
    
    target = target_color.strip()
    
    white_lightness = 85
    black_lightness = 15
    grey_saturation = 20
    # If target is a hex code, convert to HSL and do hue-range match
    if target.startswith('#'):
        target_h, target_s, target_l = _hex_to_hsl(target)
        
        # If the picked color is near-neutral, match by lightness/saturation
        if target_l > white_lightness:
            return light > white_lightness
        if target_l < black_lightness:
            return light < black_lightness
        if target_s <= grey_saturation:
            return sat <= grey_saturation and black_lightness <= light <= white_lightness
        
        # Otherwise match by hue ±30°
        diff = abs(hue - target_h)
        diff = min(diff, 360 - diff)  # noqa: PLR2004
        return diff <= hue_tolerance
    
    # Named color bucket fallback
    target_lower = target.lower()
    if target_lower == 'white':
        return light > white_lightness
    if target_lower == 'black':
        return light < black_lightness
    if target_lower == 'grey':
        return sat <= grey_saturation and black_lightness <= light <= white_lightness
        
    hues = {
        'red': 0,
        'orange': 30,  # noqa: PLR2004
        'yellow': 60,  # noqa: PLR2004
        'green': 120,  # noqa: PLR2004
        'teal': 180,  # noqa: PLR2004
        'blue': 210,  # noqa: PLR2004
        'purple': 270,  # noqa: PLR2004
        'pink': 330  # noqa: PLR2004
    }
    
    if target_lower not in hues:
        return False
        
    target_h = hues[target_lower]
    diff = abs(hue - target_h)
    diff = min(diff, 360 - diff)  # noqa: PLR2004
    
    return diff <= hue_tolerance

async def get_images(
    db: AsyncSession, 
    skip: int = 0, 
    limit: int = 100, 
    search: Optional[str] = None,
    rating: Optional[str] = None,
    tag: Optional[str] = None,
    color: Optional[str] = None,
    color_tolerance: int = 30,
    character: Optional[list[str]] = None,
    franchise: Optional[list[str]] = None,
    sort_by: Optional[str] = "date_added",
    sort_dir: Optional[str] = "desc"
) -> tuple[List[Image], int]:
    """Retrieves a paginated list of images, optionally filtered by search terms, rating, character, franchise or tag.

    Args:
        db: Database session.
        skip: Number of records to skip (for pagination).
        limit: Maximum number of records to return.
        search: Optional search term matching filename, set title, tags, or creator name.
        rating: Optional rating to filter by.
        tag: Optional single tag to filter by (matches image or set tags).
        color: Optional color to filter by (e.g. 'red', 'blue', 'white').
        sort_by: Field to sort by.
        sort_dir: Direction to sort ('asc' or 'desc').

    Returns:
        A tuple containing the list of Image objects and the total count of matches.
    """
    query = select(Image).join(Image.set)
    
    if rating:
        query = query.filter(Image.rating == rating)

    if tag or search or character or franchise:
        from app.models.tag import Tag
        from app.models.character import Character
        from app.models.franchise import Franchise

    if tag:
        query = query.filter(
            Set.tags.any(Tag.name.icontains(tag))
        )
        
    if character:
        query = query.filter(
            Set.characters.any(Character.name.in_(character))
        )

    if franchise:
        query = query.filter(
            Set.characters.any(Character.franchise.has(Franchise.name.in_(franchise)))
        )

    if search:
        query = query.join(Set.creators).outerjoin(Set.characters).outerjoin(Character.franchise).filter(
            or_(
                Image.filename.icontains(search),
                Set.title.icontains(search),
                Set.tags.any(Tag.name.icontains(search)),
                Creator.canonical_name.icontains(search),
                Character.name.icontains(search),
                Franchise.name.icontains(search)
            )
        )
        
    if color:
        query = query.filter(Image.dominant_color.is_not(None))

    # Pagination with relationship loading and sorting
    if sort_by == "file_size":
        order_col = Image.file_size
    elif sort_by == "resolution":
        order_col = Image.width * Image.height
    elif sort_by == "rating":
        order_col = Image.rating
    elif sort_by == "aspect_ratio":
        order_col = Image.aspect_ratio
    elif sort_by == "random":
        order_col = func.random()
    else:
        order_col = Image.date_added
        
    if sort_dir == "asc" and sort_by != "random":
        order_expr = order_col.asc()
    else:
        order_expr = order_col.desc() if sort_by != "random" else order_col

    # Include Image.id for deterministic sorting when values are equal
    items_query = query.distinct().options(
        selectinload(Image.set).selectinload(Set.creators)
    ).order_by(order_expr, Image.id.desc())
    
    if not color:
        # Total count
        count_query = select(func.count()).select_from(query.distinct().subquery())
        count_result = await db.execute(count_query)
        total = count_result.scalar_one()

        items_query = items_query.offset(skip).limit(limit)
        result = await db.execute(items_query)
        items = list(result.scalars().all())
    else:
        result = await db.execute(items_query)
        all_items = list(result.scalars().all())
        
        filtered_items = []
        for img in all_items:
            if _matches_color(img.dominant_color, color, hue_tolerance=color_tolerance):
                filtered_items.append(img)
                
        total = len(filtered_items)
        items = filtered_items[skip:skip+limit]

    return items, total


