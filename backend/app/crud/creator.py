"""
CRUD operations for creator (artist) database records and statistics.
"""
from typing import Optional
from collections import Counter
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.creator import Creator
from app.models.set import Set
from app.schemas.creator import CreatorCreate, CreatorUpdate, CreatorStats

async def _attach_stats(creator_obj: Creator) -> Creator:
    """Helper to calculate and attach statistics to a Creator object.

    Computes total sets, total images, combined file size, primary aspect
    ratio, and selects a preview image.

    Args:
        creator_obj: The Creator object to compute stats for.

    Returns:
        The updated Creator object with `.stats` populated.
    """
    images = []
    # Creators might have many sets, each with many images.
    # Note: creator_obj.sets MUST be loaded for this to work.
    for s in creator_obj.sets:
        images.extend(s.images)
    
    # Calculate aspect ratio frequency
    ratios = [img.aspect_ratio_label for img in images if img.aspect_ratio_label]
    primary_ar = Counter(ratios).most_common(1)[0][0] if ratios else "Unknown"
    
    # Get only the first image ID for the avatar
    preview_id = images[0].id if images else None
    
    creator_obj.stats = CreatorStats(
        total_sets=len(creator_obj.sets),
        total_images=len(images),
        total_size_bytes=sum(img.file_size or 0 for img in images),
        primary_aspect_ratio=primary_ar,
        preview_image_id=preview_id
    )
    return creator_obj

async def get_creator(db: AsyncSession, creator_id: int) -> Optional[Creator]:
    """Retrieves a creator by their ID, including associated sets and images.

    Also populates the creator's statistical metrics.
    If creator_id is 0, returns a dynamically generated 'Unknown Creator' 
    containing all wallpaper sets that have no associated creators.

    Args:
        db: Database session.
        creator_id: ID of the creator to retrieve.

    Returns:
        The Creator object if found, otherwise None.
    """
    if creator_id == 0:
        result = await db.execute(
            select(Set)
            .options(selectinload(Set.images), selectinload(Set.creators), selectinload(Set.tags), selectinload(Set.characters))
            .where(~Set.creators.any())
        )
        unassigned_sets = list(result.scalars().all())
        
        unknown_creator = Creator(
            id=0,
            canonical_name="Unknown Creator",
            type="System",
            notes="Automatically managed collection of all wallpaper sets without an assigned artist."
        )
        # Using a python list attribute instead of sqlalchemy relationship for the virtual entity
        unknown_creator.sets = unassigned_sets
        await _attach_stats(unknown_creator)
        return unknown_creator

    result = await db.execute(
        select(Creator)
        .options(
            selectinload(Creator.sets).selectinload(Set.images),
            selectinload(Creator.sets).selectinload(Set.creators),
            selectinload(Creator.sets).selectinload(Set.tags),
            selectinload(Creator.sets).selectinload(Set.characters)
        )
        .filter(Creator.id == creator_id)
    )
    creator_obj = result.scalar_one_or_none()
    if creator_obj:
        await _attach_stats(creator_obj)
    return creator_obj

async def get_creator_by_name(db: AsyncSession, name: str) -> Optional[Creator]:
    """Retrieves a creator by their exact canonical name.

    Args:
        db: Database session.
        name: The exact canonical name to search for.

    Returns:
        The Creator object if found, otherwise None.
    """
    result = await db.execute(
        select(Creator).filter(Creator.canonical_name == name)
    )
    return result.scalar_one_or_none()

async def get_creators(db: AsyncSession, skip: int = 0, limit: int = 100, search: Optional[str] = None, creator_type: Optional[str] = None, sort_by: Optional[str] = "name", sort_dir: Optional[str] = "asc") -> tuple[list[Creator], int]:
    """Retrieves a paginated list of creators, with optional filtering.

    Populates statistical metrics for each returned creator.

    Args:
        db: Database session.
        skip: Number of records to skip (pagination).
        limit: Maximum number of records to return.
        search: Optional string to match against creator canonical names.
        creator_type: Optional string to filter by creator type.

    Returns:
        A tuple containing a list of Creator objects and the total count.
    """
    # Base query for creators
    query = select(Creator)
    
    # Apply filters
    if creator_type:
        query = query.filter(Creator.type == creator_type)
    if search:
        query = query.filter(Creator.canonical_name.icontains(search))
    
    # Total count for filtered results
    count_query = select(func.count()).select_from(query.subquery())
    count_result = await db.execute(count_query)
    total = count_result.scalar_one()

    # Sorting logic
    if sort_by == "set_count":
        from app.models.associations import set_creators
        subq = select(func.count(set_creators.c.set_id)).where(set_creators.c.creator_id == Creator.id).scalar_subquery()
        order_col = subq
    elif sort_by == "total_image_count":
        from app.models.associations import set_creators
        from app.models.image import Image
        subq = select(func.count(Image.id)).select_from(set_creators).join(Image, Image.set_id == set_creators.c.set_id).where(set_creators.c.creator_id == Creator.id).scalar_subquery()
        order_col = subq
    else:
        order_col = func.lower(Creator.canonical_name)
        
    if sort_dir == "desc":
        order_expr = order_col.desc()
    else:
        order_expr = order_col.asc()

    # Final paginated query without eager loading sets/images
    query = query.order_by(order_expr, Creator.id.desc()).offset(skip).limit(limit)
    
    result = await db.execute(query)
    creators = list(result.scalars().all())

    if creators:
        from app.models.associations import set_creators
        from app.models.image import Image

        creator_ids = [c.id for c in creators]

        # 1. Aggregated numeric stats per creator
        stats_stmt = (
            select(
                set_creators.c.creator_id,
                func.count(func.distinct(set_creators.c.set_id)).label("total_sets"),
                func.count(Image.id).label("total_images"),
                func.coalesce(func.sum(Image.file_size), 0).label("total_size_bytes"),
                func.min(Image.id).label("preview_image_id"),
            )
            .select_from(set_creators)
            .outerjoin(Image, set_creators.c.set_id == Image.set_id)
            .where(set_creators.c.creator_id.in_(creator_ids))
            .group_by(set_creators.c.creator_id)
        )
        stats_map = {row.creator_id: row for row in (await db.execute(stats_stmt)).all()}

        # 2. Most common aspect ratio per creator
        ar_stmt = (
            select(
                set_creators.c.creator_id,
                Image.aspect_ratio_label,
                func.count(Image.id).label("ar_count"),
            )
            .select_from(set_creators)
            .join(Image, set_creators.c.set_id == Image.set_id)
            .where(
                set_creators.c.creator_id.in_(creator_ids),
                Image.aspect_ratio_label.isnot(None),
            )
            .group_by(set_creators.c.creator_id, Image.aspect_ratio_label)
            .order_by(set_creators.c.creator_id, func.count(Image.id).desc())
        )
        ar_res = await db.execute(ar_stmt)
        primary_ar_map = {}
        for row in ar_res.all():
            if row.creator_id not in primary_ar_map and row.aspect_ratio_label:
                primary_ar_map[row.creator_id] = row.aspect_ratio_label

        for c in creators:
            s_row = stats_map.get(c.id)
            if s_row:
                c.stats = CreatorStats(
                    total_sets=s_row.total_sets or 0,
                    total_images=s_row.total_images or 0,
                    total_size_bytes=int(s_row.total_size_bytes or 0),
                    primary_aspect_ratio=primary_ar_map.get(c.id, "Unknown"),
                    preview_image_id=s_row.preview_image_id
                )
            else:
                c.stats = CreatorStats(
                    total_sets=0,
                    total_images=0,
                    total_size_bytes=0,
                    primary_aspect_ratio="Unknown",
                    preview_image_id=None
                )

    # Inject virtual "Unknown Creator"
    if skip == 0 and (not search or "unknown" in search.lower()):
        unassigned_count_result = await db.execute(
            select(func.count(Set.id)).where(~Set.creators.any())
        )
        unassigned_count = unassigned_count_result.scalar_one()
        if unassigned_count > 0:
            unknown_creator = await get_creator(db, 0)
            if unknown_creator:
                creators.insert(0, unknown_creator)
                total += 1

    return creators, total

async def create_creator(db: AsyncSession, creator: CreatorCreate) -> Creator:
    """Creates a new creator record in the database.

    Args:
        db: Database session.
        creator: The creator schema containing new creator data.

    Returns:
        The newly created Creator object.
    """
    db_creator = Creator(**creator.model_dump(mode="json"))
    db.add(db_creator)
    await db.flush()
    await db.refresh(db_creator)
    return db_creator

async def update_creator(db: AsyncSession, creator_id: int, creator_in: CreatorUpdate) -> Optional[Creator]:
    """Updates an existing creator record and manages dependent resources.

    If the canonical name is updated, associated set folders are renamed.

    Args:
        db: Database session.
        creator_id: ID of the creator to update.
        creator_in: The creator update schema with modified data.

    Returns:
        The updated Creator object, or None if not found.
    """
    db_creator = await get_creator(db, creator_id)
    if not db_creator:
        return None
    
    update_data = creator_in.model_dump(exclude_unset=True, mode="json")
    for field in update_data:
        setattr(db_creator, field, update_data[field])
        
    from app.services.set_service import rename_set_folder_if_needed
    for s in db_creator.sets:
        await rename_set_folder_if_needed(db, s, raise_errors=True)
    
    db.add(db_creator)
    await db.flush()
    await db.refresh(db_creator)
    return await get_creator(db, creator_id)

async def delete_creator(db: AsyncSession, creator_id: int) -> Optional[Creator]:
    """Deletes a creator record from the database.

    Note: This does not delete associated sets or images.

    Args:
        db: Database session.
        creator_id: ID of the creator to delete.

    Returns:
        The deleted Creator object, or None if not found.
    """
    db_creator = await db.get(Creator, creator_id)
    if db_creator:
        await db.delete(db_creator)
        await db.flush()
    return db_creator

async def merge_creators(db: AsyncSession, source_ids: list[int], target_id: int) -> Optional[Creator]:
    """Merges multiple source creators into a single target creator.

    Re-associates all sets from the source creators to the target creator,
    renames affected set folders, and deletes the source creators.

    Args:
        db: Database session.
        source_ids: List of creator IDs to merge and delete.
        target_id: ID of the creator to merge everything into.

    Returns:
        The updated target Creator object, or None if the target was not found.
    """
    # Load target (with sets to ensure we don't duplicate associations)
    target = await get_creator(db, target_id)
    if not target:
        return None

    from app.services.set_service import rename_set_folder_if_needed
    
    for sid in source_ids:
        # Load source with its sets
        source = await get_creator(db, sid)
        if not source:
            continue
            
        # Re-associate all sets from source to target
        for s in list(source.sets):
            if target not in s.creators:
                s.creators.append(target)
            if source in s.creators:
                s.creators.remove(source)
            await rename_set_folder_if_needed(db, s, raise_errors=True)
                
        # Delete the source creator (SQLAlchemy handles many-to-many cleanup)
        await db.delete(source)
    
    await db.flush()
    await db.refresh(target)
    
    return target
