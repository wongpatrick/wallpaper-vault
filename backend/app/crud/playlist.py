"""
CRUD operations for retrieving and managing Playlists and their images.
"""
from typing import Optional, List, TYPE_CHECKING
if TYPE_CHECKING:
    from app.models.image import Image
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, update
from sqlalchemy.orm import selectinload
from app.models.playlist import Playlist, PlaylistImage
from app.schemas.playlist import PlaylistCreate, PlaylistUpdate

def apply_smart_playlist_rules_to_query(query, rules: dict):
    if not rules:
        return query
    
    from app.models.image import Image
    from app.models.tag import Tag
    from app.models.set import Set
    from app.models.creator import Creator
    from sqlalchemy import or_, not_

    included_tags = rules.get("included_tags")
    if included_tags:
        tag_filters = []
        for tag in included_tags:
            tag_filters.append(Image.tags.any(Tag.name.icontains(tag)))
            tag_filters.append(Set.tags.any(Tag.name.icontains(tag)))
        if tag_filters:
            query = query.filter(or_(*tag_filters))

    excluded_tags = rules.get("excluded_tags")
    if excluded_tags:
        for tag in excluded_tags:
            query = query.filter(not_(Image.tags.any(Tag.name.icontains(tag))))
            query = query.filter(not_(Set.tags.any(Tag.name.icontains(tag))))

    ratings = rules.get("ratings")
    if ratings:
        query = query.filter(Image.rating.in_(ratings))

    is_favorite = rules.get("is_favorite")
    if is_favorite is not None:
        query = query.filter(Image.is_favorite.is_(is_favorite))

    min_width = rules.get("min_width")
    if min_width:
        query = query.filter(Image.width >= min_width)

    min_height = rules.get("min_height")
    if min_height:
        query = query.filter(Image.height >= min_height)

    creator_id = rules.get("creator_id")
    if creator_id:
        query = query.filter(Set.creators.any(Creator.id == creator_id))

    return query


def _build_smart_playlist_base_query(rules: dict):
    """Builds the filter-only query for smart playlists (no sorting)."""
    from app.models.image import Image
    query = select(Image).join(Image.set).filter(Image.is_blacklisted.is_(False))
    query = apply_smart_playlist_rules_to_query(query, rules)
    return query


def build_smart_playlist_query(rules: dict):
    """Builds the full query for smart playlists (with sorting)."""
    from app.models.image import Image
    query = _build_smart_playlist_base_query(rules)

    sort_by = rules.get("sort_by", "date_added")
    sort_dir = rules.get("sort_dir", "desc")

    if sort_by == "filename":
        order_col = Image.filename
    elif sort_by == "resolution":
        order_col = Image.width * Image.height
    elif sort_by == "file_size":
        order_col = Image.file_size
    elif sort_by == "rating":
        order_col = Image.rating
    else:
        order_col = Image.date_added

    if sort_dir == "asc":
        query = query.order_by(order_col.asc(), Image.id.asc())
    else:
        query = query.order_by(order_col.desc(), Image.id.desc())

    return query


async def get_smart_playlist_images(db: AsyncSession, playlist: Playlist) -> List["Image"]:
    """Queries and returns the list of images matching a smart playlist's rules."""
    if not playlist.is_smart or not playlist.rules:
        return []
    stmt = build_smart_playlist_query(playlist.rules)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_smart_playlist_count(db: AsyncSession, playlist: Playlist) -> int:
    """Queries and returns the count of images matching a smart playlist's rules."""
    if not playlist.is_smart or not playlist.rules:
        return 0
    base_query = _build_smart_playlist_base_query(playlist.rules)
    count_stmt = select(func.count()).select_from(base_query.subquery())
    result = await db.execute(count_stmt)
    return result.scalar() or 0


async def get_playlist(db: AsyncSession, playlist_id: int) -> Optional[Playlist]:
    """Retrieves a single playlist by its ID, with its ordered images loaded if static."""
    stmt = (
        select(Playlist)
        .options(
            selectinload(Playlist.playlist_images)
            .selectinload(PlaylistImage.image)
        )
        .filter(Playlist.id == playlist_id)
    )
    result = await db.execute(stmt)
    playlist = result.scalar_one_or_none()
    
    if playlist:
        if playlist.is_smart:
            playlist.image_count = await get_smart_playlist_count(db, playlist)
        else:
            playlist.image_count = len(playlist.playlist_images)
    return playlist

async def get_playlist_by_name(db: AsyncSession, name: str) -> Optional[Playlist]:
    """Retrieves a playlist by its name."""
    stmt = select(Playlist).filter(Playlist.name == name)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()

async def get_playlists(db: AsyncSession) -> List[Playlist]:
    """Retrieves all playlists with their image counts, sorted by name."""
    stmt = (
        select(Playlist, func.count(PlaylistImage.image_id).label("image_count"))
        .outerjoin(PlaylistImage)
        .group_by(Playlist.id)
        .order_by(Playlist.name.asc())
    )
    result = await db.execute(stmt)
    
    playlists = []
    for playlist, image_count in result.all():
        if playlist.is_smart:
            playlist.image_count = await get_smart_playlist_count(db, playlist)
        else:
            playlist.image_count = image_count
        playlists.append(playlist)
        
    return playlists

async def create_playlist(db: AsyncSession, playlist_in: PlaylistCreate) -> Playlist:
    """Creates a new playlist."""
    db_playlist = Playlist(
        name=playlist_in.name,
        description=playlist_in.description,
        is_smart=playlist_in.is_smart,
        rules=playlist_in.rules.model_dump(exclude_unset=True) if playlist_in.rules else None
    )
    db.add(db_playlist)
    await db.commit()
    await db.refresh(db_playlist)
    if db_playlist.is_smart:
        db_playlist.image_count = await get_smart_playlist_count(db, db_playlist)
    else:
        db_playlist.image_count = 0
    return db_playlist

async def update_playlist(
    db: AsyncSession, 
    playlist_id: int, 
    playlist_in: PlaylistUpdate
) -> Optional[Playlist]:
    """Updates an existing playlist's name, description, and/or rules."""
    db_playlist = await get_playlist(db, playlist_id)
    if not db_playlist:
        return None
        
    update_data = playlist_in.model_dump(exclude_unset=True)
    for field in update_data:
        if field == "rules" and update_data[field] is not None:
            # Handle SmartPlaylistRules Pydantic dump
            val = update_data[field]
            rules_dict = val.model_dump(exclude_unset=True) if hasattr(val, "model_dump") else val
            setattr(db_playlist, field, rules_dict)
        else:
            setattr(db_playlist, field, update_data[field])
        
    db.add(db_playlist)
    await db.commit()
    await db.refresh(db_playlist)
    if db_playlist.is_smart:
        db_playlist.image_count = await get_smart_playlist_count(db, db_playlist)
    return db_playlist

async def delete_playlist(db: AsyncSession, playlist_id: int) -> Optional[Playlist]:
    """Deletes a playlist. Cascade deletes links in playlist_images."""
    db_playlist = await get_playlist(db, playlist_id)
    if not db_playlist:
        return None
        
    await db.delete(db_playlist)
    await db.commit()
    return db_playlist

async def add_images_to_playlist(
    db: AsyncSession, 
    playlist_id: int, 
    image_ids: List[int]
) -> int:
    """Adds a list of images to a playlist.
    
    Appends them to the end (based on current max sort_order) and ensures
    uniqueness (no duplicates are added).
    """
    # Quick smart-playlist guard (lightweight query, no eager loading)
    is_smart_stmt = select(Playlist.is_smart).filter(Playlist.id == playlist_id)
    is_smart_res = await db.execute(is_smart_stmt)
    if is_smart_res.scalar():
        raise ValueError("Cannot manually add images to a smart playlist")

    # 1. Fetch current max sort_order
    max_order_stmt = select(func.max(PlaylistImage.sort_order)).filter(PlaylistImage.playlist_id == playlist_id)
    max_order_res = await db.execute(max_order_stmt)
    max_order = max_order_res.scalar() or 0
    
    # 2. Fetch existing image IDs in this playlist
    existing_stmt = select(PlaylistImage.image_id).filter(PlaylistImage.playlist_id == playlist_id)
    existing_res = await db.execute(existing_stmt)
    existing_ids = set(existing_res.scalars().all())
    
    # 3. Add only new images
    new_added = 0
    current_order = max_order
    for img_id in image_ids:
        if img_id not in existing_ids:
            current_order += 1
            db_pi = PlaylistImage(
                playlist_id=playlist_id,
                image_id=img_id,
                sort_order=current_order
            )
            db.add(db_pi)
            new_added += 1
            
    if new_added > 0:
        await db.commit()
        
    return new_added

async def remove_images_from_playlist(
    db: AsyncSession, 
    playlist_id: int, 
    image_ids: List[int]
) -> int:
    """Removes a list of images from a playlist."""
    # Quick smart-playlist guard (lightweight query, no eager loading)
    is_smart_stmt = select(Playlist.is_smart).filter(Playlist.id == playlist_id)
    is_smart_res = await db.execute(is_smart_stmt)
    if is_smart_res.scalar():
        raise ValueError("Cannot manually remove images from a smart playlist")

    stmt = (
        delete(PlaylistImage)
        .filter(
            PlaylistImage.playlist_id == playlist_id,
            PlaylistImage.image_id.in_(image_ids)
        )
    )
    result = await db.execute(stmt)
    await db.commit()
    return result.rowcount

async def reorder_playlist_images(
    db: AsyncSession, 
    playlist_id: int, 
    image_ids: List[int]
) -> None:
    """Reorders images within a playlist to match the sequence of the provided IDs list."""
    # Quick smart-playlist guard (lightweight query, no eager loading)
    is_smart_stmt = select(Playlist.is_smart).filter(Playlist.id == playlist_id)
    is_smart_res = await db.execute(is_smart_stmt)
    if is_smart_res.scalar():
        raise ValueError("Cannot manually reorder a smart playlist")

    for index, img_id in enumerate(image_ids):
        stmt = (
            update(PlaylistImage)
            .filter(
                PlaylistImage.playlist_id == playlist_id,
                PlaylistImage.image_id == img_id
            )
            .values(sort_order=index)
        )
        await db.execute(stmt)
    await db.commit()
