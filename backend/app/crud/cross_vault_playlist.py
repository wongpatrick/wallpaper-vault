"""
CRUD operations for cross-vault playlist images.
"""
from typing import List, Optional, Sequence
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.playlist import CrossVaultPlaylistImage
from app.schemas.playlist import CrossVaultImageRef

async def get_images(db: AsyncSession, playlist_id: int) -> Sequence[CrossVaultPlaylistImage]:
    """Get all cross-vault image records for a playlist, ordered by sort_order."""
    stmt = (
        select(CrossVaultPlaylistImage)
        .where(CrossVaultPlaylistImage.playlist_id == playlist_id)
        .order_by(CrossVaultPlaylistImage.sort_order.asc(), CrossVaultPlaylistImage.id.asc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()

async def get_image_count(db: AsyncSession, playlist_id: int) -> int:
    """Get total count of cross-vault images in a playlist."""
    stmt = select(func.count(CrossVaultPlaylistImage.id)).where(
        CrossVaultPlaylistImage.playlist_id == playlist_id
    )
    result = await db.execute(stmt)
    return result.scalar() or 0

async def add_images(
    db: AsyncSession, playlist_id: int, images: List[CrossVaultImageRef]
) -> List[CrossVaultPlaylistImage]:
    """
    Append cross-vault image references to the playlist.
    Ignores duplicates that already exist in the playlist.
    """
    if not images:
        return []

    # Get existing items to prevent duplicates
    existing_items = await get_images(db, playlist_id)
    existing_set = {(item.vault_id, item.image_id) for item in existing_items}

    # Determine starting sort_order
    current_max_order = -1
    for item in existing_items:
        if item.sort_order > current_max_order:
            current_max_order = item.sort_order

    new_records: List[CrossVaultPlaylistImage] = []
    for img in images:
        key = (img.vault_id, img.image_id)
        if key in existing_set:
            continue
        existing_set.add(key)
        current_max_order += 1
        record = CrossVaultPlaylistImage(
            playlist_id=playlist_id,
            vault_id=img.vault_id,
            image_id=img.image_id,
            sort_order=current_max_order,
        )
        db.add(record)
        new_records.append(record)

    await db.flush()
    return new_records

async def remove_images(
    db: AsyncSession, playlist_id: int, images: List[CrossVaultImageRef]
) -> int:
    """Remove specific cross-vault image references from a playlist."""
    if not images:
        return 0

    removed_count = 0
    for img in images:
        stmt = delete(CrossVaultPlaylistImage).where(
            CrossVaultPlaylistImage.playlist_id == playlist_id,
            CrossVaultPlaylistImage.vault_id == img.vault_id,
            CrossVaultPlaylistImage.image_id == img.image_id,
        )
        res = await db.execute(stmt)
        removed_count += res.rowcount or 0

    await db.flush()
    return removed_count

async def reorder_images(
    db: AsyncSession, playlist_id: int, images: List[CrossVaultImageRef]
) -> None:
    """Reorder cross-vault images in a playlist based on the provided sequence."""
    existing_items = await get_images(db, playlist_id)
    item_map = {(item.vault_id, item.image_id): item for item in existing_items}

    for order, img_ref in enumerate(images):
        key = (img_ref.vault_id, img_ref.image_id)
        if key in item_map:
            item_map[key].sort_order = order

    await db.flush()

async def get_random_image(
    db: AsyncSession, playlist_id: int, online_vault_ids: Optional[set[str]] = None
) -> Optional[CrossVaultPlaylistImage]:
    """
    Select a random cross-vault image from a playlist, optionally filtered by online vaults.
    """
    query = select(CrossVaultPlaylistImage).where(
        CrossVaultPlaylistImage.playlist_id == playlist_id
    )

    if online_vault_ids is not None:
        if not online_vault_ids:
            # All vaults offline
            return None
        query = query.where(CrossVaultPlaylistImage.vault_id.in_(online_vault_ids))

    query = query.order_by(func.random()).limit(1)
    result = await db.execute(query)
    return result.scalar_one_or_none()
