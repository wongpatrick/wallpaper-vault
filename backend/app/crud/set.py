"""
CRUD operations and business logic for managing wallpaper sets and bulk imports.
"""
from typing import Optional
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.models.creator import Creator
from app.models.set import Set
from app.models.image import Image
from app.models.character import Character
from app.models.franchise import Franchise
from app.models.tag import Tag
from app.schemas.set import (
    SetCreate, 
    SetUpdate,
    SetBulkUpdate
)
from app.core.enums import BulkOperationMode
from app.crud.settings import get_setting
from app.services.import_processor import batch_import_sets, run_batch_import_background
import structlog

__all__ = [
    "batch_import_sets",
    "run_batch_import_background",
]

logger = structlog.get_logger(__name__)

async def get_set(db: AsyncSession, set_id: int) -> Optional[Set]:
    """Retrieves a specific set by its ID, including creators and images.

    Args:
        db: Database session.
        set_id: ID of the set.

    Returns:
        The Set object if found, otherwise None.
    """
    result = await db.execute(
        select(Set).options(
            selectinload(Set.creators),
            selectinload(Set.images).selectinload(Image.tags),
            selectinload(Set.images).selectinload(Image.characters),
            selectinload(Set.tags),
            selectinload(Set.characters)
        ).filter(Set.id == set_id)
    )
    return result.scalar_one_or_none()


async def recalculate_set_rollup_tags(
    db: AsyncSession, set_id: int, additive: bool = False
) -> None:
    """Recalculates the rollup tags for a set based on image tags and rollup threshold.

    If additive=True, existing tags on the set are preserved and new rollup tags are appended.
    If additive=False, the set's tags are replaced with the computed rollup tags.
    """
    result = await db.execute(
        select(Set).options(
            selectinload(Set.images).selectinload(Image.tags),
            selectinload(Set.tags)
        ).filter(Set.id == set_id)
    )
    db_set = result.scalar_one_or_none()
    if not db_set:
        return
    
    rollup_threshold_setting = await get_setting(db, "ai_rollup_threshold")
    if rollup_threshold_setting and rollup_threshold_setting.value:
        try:
            rollup_threshold = float(rollup_threshold_setting.value)
        except ValueError:
            rollup_threshold = 0.3
    else:
        rollup_threshold = 0.3

    if db_set.images:
        tag_counts = {}
        tag_objects = {}
        for img in db_set.images:
            for t in img.tags:
                tag_counts[t.name] = tag_counts.get(t.name, 0) + 1
                tag_objects[t.name] = t

        rollup_tags = []
        num_images = len(db_set.images)
        for tag_name, count in tag_counts.items():
            freq = float(count) / num_images
            if freq >= rollup_threshold:
                rollup_tags.append(tag_objects[tag_name])
        
        if additive:
            existing_tag_ids = {t.id for t in db_set.tags}
            for t in rollup_tags:
                if t.id not in existing_tag_ids:
                    db_set.tags.append(t)
                    existing_tag_ids.add(t.id)
        else:
            db_set.tags = rollup_tags
    else:
        if not additive:
            db_set.tags = []
        
    db.add(db_set)
    await db.flush()


async def get_sets(db: AsyncSession, skip: int = 0, limit: int = 100, search: Optional[str] = None, creator_type: Optional[str] = None, sort_by: Optional[str] = "id", sort_dir: Optional[str] = "desc", tag: Optional[str] = None, character: Optional[list[str]] = None, franchise: Optional[list[str]] = None) -> tuple[list[Set], int]:
    """Retrieves a paginated list of sets, with optional filtering.

    Args:
        db: Database session.
        skip: Number of records to skip.
        limit: Maximum number of records to return.
        search: Optional search term matching title or creator names.
        creator_type: Optional creator type filter.

    Returns:
        A tuple containing a list of Set objects and the total match count.
    """
    # Base query for sets
    query = select(Set)
    
    # Apply filters
    if creator_type:
        query = query.filter(Set.creators.any(Creator.type == creator_type))
    if tag:
        query = query.filter(Set.tags.any(Tag.name.icontains(tag)))
    if character:
        query = query.filter(Set.characters.any(Character.name.in_(character)))
    if franchise:
        query = query.filter(Set.characters.any(Character.franchise.has(Franchise.name.in_(franchise))))
    if search:
        query = query.filter(
            or_(
                Set.title.icontains(search),
                Set.tags.any(Tag.name.icontains(search)),
                Set.creators.any(Creator.canonical_name.icontains(search)),
                Set.characters.any(Character.name.icontains(search)),
                Set.characters.any(Character.franchise.has(Franchise.name.icontains(search)))
            )
        )
    
    # Total count for filtered results
    count_query = select(func.count()).select_from(query.distinct().subquery())
    count_result = await db.execute(count_query)
    total = count_result.scalar_one()

    # Sorting logic
    if sort_by == "title":
        order_col = func.lower(Set.title)
    elif sort_by == "image_count":
        # Subquery to count images for each set
        subq = select(func.count(Image.id)).where(Image.set_id == Set.id).scalar_subquery()
        order_col = subq
    else:
        order_col = Set.created_at
        
    if sort_dir == "asc":
        order_expr = order_col.asc()
    else:
        order_expr = order_col.desc()

    # Final paginated query with relationship loading (images omitted for payload optimization)
    # We use distinct() because the join might create multiple rows per set
    sets_query = query.distinct().options(
        selectinload(Set.creators),
        selectinload(Set.tags),
        selectinload(Set.characters)
    ).order_by(order_expr, Set.id.desc()).offset(skip).limit(limit)
    
    result = await db.execute(sets_query)
    sets_list = list(result.scalars().all())

    if sets_list:
        set_ids = [s.id for s in sets_list]
        stats_stmt = (
            select(
                Image.set_id,
                func.count(Image.id).label("img_count"),
                func.min(Image.id).label("min_img_id")
            )
            .where(Image.set_id.in_(set_ids))
            .group_by(Image.set_id)
        )
        stats_res = await db.execute(stats_stmt)
        stats_map = {row.set_id: (row.img_count, row.min_img_id) for row in stats_res.all()}
        for s in sets_list:
            img_count, min_id = stats_map.get(s.id, (0, None))
            s.image_count = img_count
            s.preview_image_id = min_id

    return sets_list, total

async def create_set(db: AsyncSession, set_in: SetCreate) -> Set:
    """Creates a new Set record and associates requested creators and images.

    Args:
        db: Database session.
        set_in: The creation schema containing set details.

    Returns:
        The newly created Set object.
    """
    data = set_in.model_dump(exclude={"creator_ids", "images", "tags", "characters"})
    # Normalize empty source_url to None to avoid UNIQUE constraint issues in SQLite
    if data.get("source_url") == "":
        data["source_url"] = None
        
    db_set = Set(**data)

    if set_in.creator_ids:
        result = await db.execute(
            select(Creator).where(Creator.id.in_(set_in.creator_ids))
        )
        creators = result.scalars().all()
        db_set.creators = list(creators)
        
    if set_in.tags:
        from app.crud.tag import get_tags_by_names
        db_set.tags = await get_tags_by_names(db, set_in.tags)

    if set_in.characters:
        from app.crud.character import get_characters_by_names
        db_set.characters = await get_characters_by_names(db, set_in.characters)
    
    if set_in.images:
        # File sizing and CV2 processing has been moved to services/set_service.py
        new_images = [Image(**image_in.model_dump()) for image_in in set_in.images]
        db_set.images = new_images

    db.add(db_set)
    await db.flush()
    await db.refresh(db_set)
    query = (
        select(Set)
        .options(
            selectinload(Set.creators),
            selectinload(Set.images),
            selectinload(Set.tags),
            selectinload(Set.characters)
        )
        .filter(Set.id == db_set.id)
    )
    result = await db.execute(query)
    return result.scalar_one()

async def get_set_by_title_and_creator(db: AsyncSession, title: str, creator_id: int) -> Optional[Set]:
    """Checks if a set already exists with a specific title for a given creator.

    Args:
        db: Database session.
        title: Title of the set.
        creator_id: ID of the creator.

    Returns:
        The matching Set object, or None if not found.
    """
    result = await db.execute(
        select(Set)
        .join(Set.creators)
        .filter(Set.title == title)
        .filter(Creator.id == creator_id)
    )
    return result.scalar_one_or_none()


async def get_set_by_title_and_creators(
    db: AsyncSession, 
    title: str, 
    creator_ids: list[int],
    load_relations: bool = True
) -> Optional[Set]:
    """Checks if a set already exists with a specific title and the exact same set of creators (order-independent).

    Args:
        db: Database session.
        title: Title of the set.
        creator_ids: List of creator IDs.
        load_relations: If True, loads Set's associated collections (images, tags, characters) to prevent lazy loading issues.

    Returns:
        The matching Set object, or None if not found.
    """
    stmt = select(Set).filter(Set.title == title)
    if load_relations:
        stmt = stmt.options(
            selectinload(Set.creators),
            selectinload(Set.images).selectinload(Image.tags),
            selectinload(Set.tags),
            selectinload(Set.characters)
        )
    else:
        stmt = stmt.options(selectinload(Set.creators))
        
    result = await db.execute(stmt)
    sets = result.scalars().all()
    
    target_creators = set(creator_ids)
    for s in sets:
        s_creators = {c.id for c in s.creators}
        if s_creators == target_creators:
            return s
    return None




async def delete_set(db: AsyncSession, set_id: int) -> Optional[Set]:
    """Deletes a set record from the database session.

    Args:
        db: Database session.
        set_id: ID of the set to delete.

    Returns:
        The deleted Set object, or None if not found.
    """
    db_set = await get_set(db, set_id)
    if db_set:
        await db.delete(db_set)
        await db.flush()
    return db_set


async def update_set(db: AsyncSession, set_id: int, set_in: SetUpdate) -> Optional[Set]:
    """Updates an existing set and manages physical folder renaming.

    Args:
        db: Database session.
        set_id: ID of the set to update.
        set_in: The set update schema with modified data.

    Returns:
        The updated Set object, or None if not found.
    """
    db_set = await get_set(db, set_id)
    if not db_set:
        return None
    
    update_data = set_in.model_dump(exclude_unset=True, exclude={"creator_ids", "tags", "characters"})
    # Normalize empty source_url to None to avoid UNIQUE constraint issues in SQLite
    if "source_url" in update_data and update_data["source_url"] == "":
        update_data["source_url"] = None
        
    for field in update_data:
        setattr(db_set, field, update_data[field])
    
    if set_in.creator_ids is not None:
        result = await db.execute(
            select(Creator).where(Creator.id.in_(set_in.creator_ids))
        )
        creators = result.scalars().all()
        db_set.creators = list(creators)

    if set_in.tags is not None:
        from app.crud.tag import get_tags_by_names
        db_set.tags = await get_tags_by_names(db, set_in.tags)
        
    if set_in.characters is not None:
        from app.crud.character import get_characters_by_names
        db_set.characters = await get_characters_by_names(db, set_in.characters)
    
    # Note: Automatic Folder Renaming Logic was moved to services/set_service.py
    
    db.add(db_set)
    await db.flush()
    await db.refresh(db_set)
    
    # Re-fetch with relationships
    return await get_set(db, set_id)


async def bulk_update_sets(db: AsyncSession, bulk_in: SetBulkUpdate) -> int:
    """Performs bulk updates on multiple sets.

    Handles appending, removing, or replacing tags and creators across sets,
    and ensures folder renaming logic fires where applicable.

    Args:
        db: Database session.
        bulk_in: Schema containing the sets to update and the modifications.

    Returns:
        The number of sets successfully updated.
    """
    # 1. Fetch all target sets with creators, images, and tags
    result = await db.execute(
        select(Set).options(
            selectinload(Set.creators), 
            selectinload(Set.images),
            selectinload(Set.tags),
            selectinload(Set.characters)
        ).where(Set.id.in_(bulk_in.set_ids))
    )
    db_sets = result.scalars().all()
    
    if not db_sets:
        return 0
    
    # 2. Get Creators if creator_ids provided
    target_creators = []
    if bulk_in.update_data.creator_ids is not None:
        c_result = await db.execute(
            select(Creator).where(Creator.id.in_(bulk_in.update_data.creator_ids))
        )
        target_creators = c_result.scalars().all()
        
    # 3. Get Tags if tags provided
    target_tags = []
    if bulk_in.update_data.tags is not None:
        from app.crud.tag import get_tags_by_names
        target_tags = await get_tags_by_names(db, bulk_in.update_data.tags)

    # 3.5. Get Characters if provided
    target_characters = []
    if bulk_in.update_data.characters is not None:
        from app.crud.character import get_characters_by_names
        target_characters = await get_characters_by_names(db, bulk_in.update_data.characters)

    # 4. Apply updates
    update_fields = bulk_in.update_data.model_dump(exclude_unset=True, exclude={"creator_ids", "tags", "characters"})
    
    for db_set in db_sets:
        # Standard fields (notes, title, etc)
        for field in update_fields:
            if bulk_in.operation_mode == BulkOperationMode.APPEND and field == "notes":
                current_notes = db_set.notes or ""
                new_notes = update_fields[field] or ""
                db_set.notes = f"{current_notes}\n{new_notes}".strip() if current_notes else new_notes
            elif bulk_in.operation_mode == BulkOperationMode.REMOVE and field == "notes":
                db_set.notes = None
            else:
                setattr(db_set, field, update_fields[field])
                
        # Tags logic
        if bulk_in.update_data.tags is not None:
            if bulk_in.operation_mode == BulkOperationMode.APPEND:
                current_ids = {t.id for t in db_set.tags}
                to_add = [t for t in target_tags if t.id not in current_ids]
                db_set.tags.extend(to_add)
            elif bulk_in.operation_mode == BulkOperationMode.REMOVE:
                remove_ids = {t.id for t in target_tags}
                db_set.tags = [t for t in db_set.tags if t.id not in remove_ids]
            else:
                db_set.tags = list(target_tags)

        # Characters logic
        if bulk_in.update_data.characters is not None:
            if bulk_in.operation_mode == BulkOperationMode.APPEND:
                current_ids = {c.id for c in db_set.characters}
                to_add = [c for c in target_characters if c.id not in current_ids]
                db_set.characters.extend(to_add)
            elif bulk_in.operation_mode == BulkOperationMode.REMOVE:
                remove_ids = {c.id for c in target_characters}
                db_set.characters = [c for c in db_set.characters if c.id not in remove_ids]
            else:
                db_set.characters = list(target_characters)
        
        # Creator logic
        if bulk_in.update_data.creator_ids is not None:
            if bulk_in.operation_mode == BulkOperationMode.APPEND:
                current_ids = {c.id for c in db_set.creators}
                to_add = [c for c in target_creators if c.id not in current_ids]
                db_set.creators.extend(to_add)
            elif bulk_in.operation_mode == BulkOperationMode.REMOVE:
                remove_ids = {c.id for c in target_creators}
                db_set.creators = [c for c in db_set.creators if c.id not in remove_ids]
            else:
                db_set.creators = list(target_creators)
        
        # Note: Automatic Folder Renaming Logic was moved to services/set_service.py
        
        db.add(db_set)

    await db.flush()
    return len(db_sets)





async def bulk_delete_sets(db: AsyncSession, set_ids: list[int]) -> int:
    """Deletes multiple set records from the database session.

    Args:
        db: Database session.
        set_ids: List of set IDs to delete.

    Returns:
        The number of sets successfully deleted.
    """
    result = await db.execute(
        select(Set).options(selectinload(Set.images)).where(Set.id.in_(set_ids))
    )
    db_sets = result.scalars().all()

    if not db_sets:
        return 0

    for db_set in db_sets:
        await db.delete(db_set)

    await db.flush()
    return len(db_sets)
