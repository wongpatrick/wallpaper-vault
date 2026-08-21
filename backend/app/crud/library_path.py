"""
CRUD operations for retrieving and managing library storage paths.
"""
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from app.models.library_path import LibraryPath
from app.models.set import Set
from app.schemas.library_path import LibraryPathCreate, LibraryPathUpdate
from app.schemas.settings import SettingUpdate
from app.crud.settings import update_setting
import structlog

logger = structlog.get_logger(__name__)

async def get_library_path(db: AsyncSession, path_id: int) -> Optional[LibraryPath]:
    """Retrieve a library path by ID."""
    result = await db.execute(select(LibraryPath).where(LibraryPath.id == path_id))
    return result.scalars().first()

async def get_library_path_by_path(db: AsyncSession, path: str) -> Optional[LibraryPath]:
    """Retrieve a library path by its exact folder path."""
    normalized = path.strip().replace('\\', '/')
    result = await db.execute(select(LibraryPath).where(LibraryPath.path == normalized))
    return result.scalars().first()

async def get_default_library_path(db: AsyncSession) -> Optional[LibraryPath]:
    """Retrieve the designated default library path, falling back to the first available path."""
    stmt = select(LibraryPath).where(LibraryPath.is_default.is_(True))
    result = await db.execute(stmt)
    lp = result.scalars().first()
    if not lp:
        # Fallback to the first created path
        fallback = await db.execute(select(LibraryPath).order_by(LibraryPath.id.asc()))
        lp = fallback.scalars().first()
    return lp

async def list_library_paths(db: AsyncSession) -> tuple[list[dict], int]:
    """Retrieve all library paths with their associated set counts."""
    set_count_sub = (
        select(func.count(Set.id))
        .where(Set.library_path_id == LibraryPath.id)
        .scalar_subquery()
        .label("set_count")
    )

    stmt = select(
        LibraryPath,
        set_count_sub
    ).order_by(LibraryPath.is_default.desc(), LibraryPath.id.asc())

    result = await db.execute(stmt)
    rows = result.all()

    items = []
    for row in rows:
        lp: LibraryPath = row.LibraryPath
        items.append({
            "id": lp.id,
            "path": lp.path,
            "label": lp.label,
            "is_default": lp.is_default,
            "created_at": str(lp.created_at) if lp.created_at else None,
            "set_count": row.set_count or 0
        })

    return items, len(items)

async def create_library_path(db: AsyncSession, path_in: LibraryPathCreate) -> LibraryPath:
    """Create a new library storage path. If marked default or if it is the first path, sets is_default."""
    normalized_path = path_in.path.strip().replace('\\', '/')
    
    # Check if there are existing paths
    count_res = await db.execute(select(func.count(LibraryPath.id)))
    total_count = count_res.scalar() or 0
    
    is_default = path_in.is_default or total_count == 0
    
    if is_default and total_count > 0:
        # Clear default flag on existing paths
        await db.execute(update(LibraryPath).values(is_default=False))

    db_obj = LibraryPath(
        path=normalized_path,
        label=path_in.label.strip() if path_in.label else None,
        is_default=is_default
    )
    db.add(db_obj)
    await db.flush()
    await db.refresh(db_obj)

    if is_default:
        await update_setting(db, "base_library_path", SettingUpdate(value=normalized_path))

    return db_obj

async def update_library_path(
    db: AsyncSession,
    path_id: int,
    path_in: LibraryPathUpdate
) -> Optional[LibraryPath]:
    """Update label and/or default status of a library path."""
    db_obj = await get_library_path(db, path_id)
    if not db_obj:
        return None

    if path_in.label is not None:
        db_obj.label = path_in.label.strip() if path_in.label else None

    if path_in.is_default is not None:
        if path_in.is_default:
            # Unset default on all other paths
            await db.execute(update(LibraryPath).where(LibraryPath.id != path_id).values(is_default=False))
            db_obj.is_default = True
            await update_setting(db, "base_library_path", SettingUpdate(value=db_obj.path))
        else:
            db_obj.is_default = False

    await db.flush()
    await db.refresh(db_obj)
    return db_obj

async def delete_library_path(db: AsyncSession, path_id: int) -> bool:
    """
    Delete a library path.
    Unlinks associated sets by setting their library_path_id = NULL without modifying files on disk.
    If the deleted path was default, reassigns default to the next available path.
    """
    db_obj = await get_library_path(db, path_id)
    if not db_obj:
        return False

    was_default = db_obj.is_default

    # Unlink sets
    await db.execute(update(Set).where(Set.library_path_id == path_id).values(library_path_id=None))

    await db.delete(db_obj)
    await db.flush()

    if was_default:
        # Reassign default to the first remaining path
        next_path = (await db.execute(select(LibraryPath).order_by(LibraryPath.id.asc()))).scalars().first()
        if next_path:
            next_path.is_default = True
            await db.flush()
            await update_setting(db, "base_library_path", SettingUpdate(value=next_path.path))
        else:
            await update_setting(db, "base_library_path", SettingUpdate(value=""))

    return True
