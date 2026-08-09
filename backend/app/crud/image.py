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
from collections import defaultdict
import structlog

from app.core.constants import PRESET_SWATCHES
from app.core.color_utils import matches_color as _matches_color, resolve_target_color_bucket

logger = structlog.get_logger(__name__)

async def get_random_image(
    db: AsyncSession, 
    tags: Optional[list[str]] = None, 
    aspect_ratio_label: Optional[str] = None,
    min_width: Optional[int] = None,
    min_height: Optional[int] = None,
    creator_id: Optional[int] = None,
    playlist_id: Optional[int] = None,
    rating: Optional[str] = None,
    favorite_probability: Optional[float] = None,
    orientation: Optional[str] = None
) -> Optional[Image]:
    """Selects a random Image from the database matching the criteria.

    Args:
        db: Database session.
        tags: Optional list of tags to filter by.
        aspect_ratio_label: Optional aspect ratio label (e.g., '16:9').
        min_width: Minimum image width in pixels.
        min_height: Minimum image height in pixels.
        creator_id: Optional creator ID to filter by.
        playlist_id: Optional playlist ID to filter by.
        rating: Optional rating to filter by.
        favorite_probability: Custom probability rate (0.0 to 1.0) overrides settings.
        orientation: Optional orientation filter: 'landscape' or 'portrait'.

    Returns:
        A random Image object matching the filters, or None if no match is found.
    """
    query = select(Image).join(Image.set)
    
    # Always exclude blacklisted wallpapers
    query = query.filter(Image.is_blacklisted.is_(False))
    
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
        
    if orientation:
        if orientation == "landscape":
            query = query.filter(Image.width > Image.height)
        elif orientation == "portrait":
            query = query.filter(Image.width < Image.height)
        
    if min_width:
        query = query.filter(Image.width >= min_width)
        
    if min_height:
        query = query.filter(Image.height >= min_height)
        
    if creator_id:
        query = query.join(Set.creators).filter(Creator.id == creator_id)

    if playlist_id:
        from app.models.playlist import Playlist
        res_pl = await db.execute(select(Playlist).filter(Playlist.id == playlist_id))
        playlist = res_pl.scalar_one_or_none()
        if playlist and playlist.is_smart:
            from app.crud.playlist import apply_smart_playlist_rules_to_query
            query = apply_smart_playlist_rules_to_query(query, playlist.rules)
        else:
            from app.models.playlist import PlaylistImage
            query = query.join(Image.playlist_images).filter(PlaylistImage.playlist_id == playlist_id)

    if rating:
        query = query.filter(Image.rating == rating)

    # Implement weighted random favoring favorites
    if favorite_probability is not None:
        favorite_prob = favorite_probability
    else:
        from app.crud.settings import get_setting
        prob_setting = await get_setting(db, "favorite_rotation_probability")
        try:
            favorite_prob = float(prob_setting.value) if prob_setting else 0.4
        except ValueError:
            favorite_prob = 0.4

    import random
    if random.random() < favorite_prob:
        # Try to get a favorite image first, applying all same constraints
        fav_query = query.filter(Image.is_favorite.is_(True)).order_by(func.random()).limit(1)
        result = await db.execute(fav_query)
        db_image = result.scalar_one_or_none()
        if db_image:
            return db_image

    # Fall back to standard query (any non-blacklisted image)
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
        .options(
            selectinload(Image.tags),
            selectinload(Image.characters),
            selectinload(Image.set).selectinload(Set.creators)
        )
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
    await db.flush()
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
    
    update_data = image_in.model_dump(exclude_unset=True, exclude={"tags", "characters"})
    for field in update_data:
        setattr(db_image, field, update_data[field])
        
    if image_in.tags is not None:
        from app.crud.tag import get_tags_by_names
        db_image.tags = await get_tags_by_names(db, image_in.tags)
        
    if image_in.characters is not None:
        from app.crud.character import get_characters_by_names
        db_image.characters = await get_characters_by_names(db, image_in.characters)
    
    db.add(db_image)
    await db.flush()
    await db.refresh(db_image)
    
    if db_image.set_id:
        from app.crud.set import recalculate_set_rollup_tags
        await recalculate_set_rollup_tags(db, db_image.set_id)
        
    return await get_image(db, image_id)

from app.core.enums import BulkOperationMode

async def bulk_update_images(db: AsyncSession, bulk_in: ImageBulkUpdate) -> int:
    """Performs a bulk update on multiple image records in the database.

    Handles appending, removing, or replacing tags, characters, and notes across images,
    and recalculates set rollup tags for all affected sets.

    Args:
        db: Database session.
        bulk_in: Bulk update schema containing target IDs, update data, and operation mode.

    Returns:
        The number of images successfully updated.
    """
    result = await db.execute(
        select(Image).options(
            selectinload(Image.tags),
            selectinload(Image.characters),
        ).where(Image.id.in_(bulk_in.image_ids))
    )
    db_images = result.scalars().all()

    if not db_images:
        return 0

    # 1. Resolve tags if provided
    target_tags = []
    if bulk_in.update_data.tags is not None:
        from app.crud.tag import get_tags_by_names
        resolved_tags = await get_tags_by_names(db, bulk_in.update_data.tags)
        target_tags = list({t.id: t for t in resolved_tags}.values())

    # 2. Resolve characters if provided
    target_characters = []
    if bulk_in.update_data.characters is not None:
        from app.crud.character import get_characters_by_names
        resolved_chars = await get_characters_by_names(db, bulk_in.update_data.characters)
        target_characters = list({c.id: c for c in resolved_chars}.values())

    # 3. Scalar fields (exclude tags, characters, and read-only attributes)
    update_fields = bulk_in.update_data.model_dump(
        exclude_unset=True,
        exclude={
            "filename", "local_path", "phash", "width", "height",
            "file_size", "aspect_ratio", "aspect_ratio_label",
            "tags", "characters",
        }
    )

    affected_set_ids = set()
    for db_img in db_images:
        if db_img.set_id:
            affected_set_ids.add(db_img.set_id)

        # Standard fields & Notes logic
        for field in update_fields:
            if field == "notes":
                if bulk_in.operation_mode == BulkOperationMode.APPEND:
                    current_notes = db_img.notes or ""
                    new_notes = update_fields[field] or ""
                    db_img.notes = f"{current_notes}\n{new_notes}".strip() if current_notes else new_notes
                elif bulk_in.operation_mode == BulkOperationMode.REMOVE:
                    db_img.notes = None
                else:
                    db_img.notes = update_fields[field]
            else:
                setattr(db_img, field, update_fields[field])

        # Tags logic
        if bulk_in.update_data.tags is not None:
            if bulk_in.operation_mode == BulkOperationMode.APPEND:
                current_ids = {t.id for t in db_img.tags}
                to_add = [t for t in target_tags if t.id not in current_ids]
                db_img.tags.extend(to_add)
            elif bulk_in.operation_mode == BulkOperationMode.REMOVE:
                remove_ids = {t.id for t in target_tags}
                db_img.tags = [t for t in db_img.tags if t.id not in remove_ids]
            else:  # REPLACE
                db_img.tags = list(target_tags)

        # Characters logic
        if bulk_in.update_data.characters is not None:
            if bulk_in.operation_mode == BulkOperationMode.APPEND:
                current_ids = {c.id for c in db_img.characters}
                to_add = [c for c in target_characters if c.id not in current_ids]
                db_img.characters.extend(to_add)
            elif bulk_in.operation_mode == BulkOperationMode.REMOVE:
                remove_ids = {c.id for c in target_characters}
                db_img.characters = [c for c in db_img.characters if c.id not in remove_ids]
            else:  # REPLACE
                db_img.characters = list(target_characters)

        db.add(db_img)

    await db.flush()

    # Recalculate set rollup tags for all affected sets
    if bulk_in.update_data.tags is not None or bulk_in.update_data.characters is not None:
        from app.crud.set import recalculate_set_rollup_tags
        for s_id in affected_set_ids:
            await recalculate_set_rollup_tags(db, s_id)

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
        await db.flush()
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
    
    preset_swatches = PRESET_SWATCHES
    
    counts = {swatch: 0 for swatch in preset_swatches}
    
    for c in colors:
        for swatch in preset_swatches:
            if _matches_color(c, swatch, hue_tolerance=tolerance):
                counts[swatch] += 1
                break
                
    return [{"color": k, "count": v} for k, v in counts.items() if v > 0]

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
    sort_by: Optional[str] = "created_at",
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
        target_bucket = resolve_target_color_bucket(color)
        if target_bucket:
            query = query.filter(Image.dominant_color_bucket == target_bucket)
        else:
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
        order_col = Image.created_at
        
    if sort_dir == "asc" and sort_by != "random":
        order_expr = order_col.asc()
    else:
        order_expr = order_col.desc() if sort_by != "random" else order_col

    # Include Image.id for deterministic sorting when values are equal
    items_query = query.distinct().options(
        selectinload(Image.set).selectinload(Set.creators)
    ).order_by(order_expr, Image.id.desc())
    
    # Total count
    count_query = select(func.count()).select_from(query.distinct().subquery())
    count_result = await db.execute(count_query)
    total = count_result.scalar_one()

    items_query = items_query.offset(skip).limit(limit)
    result = await db.execute(items_query)
    items = list(result.scalars().all())

    return items, total


