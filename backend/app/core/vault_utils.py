"""
Vault root resolution utilities.
Consolidates resolving the active vault/library storage path and finding all vault roots.
"""

from pathlib import Path
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import library_path as crud_lp
from app.crud.settings import get_setting
from app.models.library_path import LibraryPath
from app.core.exceptions import FileSystemError


async def resolve_vault_root(
    db: AsyncSession,
    library_path_id: Optional[int] = None,
) -> tuple[Path, Optional[int]]:
    """Resolve the active library storage root directory.

    Priority:
    1. Explicit library_path_id (if provided and valid)
    2. Default LibraryPath in database
    3. base_library_path setting in settings table

    Returns:
        tuple[Path, Optional[int]]: (vault_root_path, resolved_library_path_id)

    Raises:
        FileSystemError: If no library storage path is configured.
    """
    target_lp = None
    if library_path_id is not None:
        target_lp = await crud_lp.get_library_path(db, int(library_path_id))

    if not target_lp:
        target_lp = await crud_lp.get_default_library_path(db)

    vault_path_str: Optional[str] = None
    resolved_id: Optional[int] = None

    if target_lp and target_lp.path:
        vault_path_str = target_lp.path
        resolved_id = target_lp.id
    else:
        vault_setting = await get_setting(db, "base_library_path")
        if vault_setting and vault_setting.value:
            vault_path_str = vault_setting.value

    if not vault_path_str or not vault_path_str.strip():
        raise FileSystemError("No library storage path configured")

    return Path(vault_path_str.strip()), resolved_id


async def resolve_all_vault_roots(
    db: AsyncSession,
    input_roots: Optional[str | list[str]] = None,
) -> list[Path]:
    """Resolve all configured vault roots (for auditing, scanning, etc.).

    Priority:
    1. Explicit input roots if provided.
    2. All registered paths in LibraryPath table.
    3. Fallback to base_library_path setting if no LibraryPath exists.
    """
    vault_roots: list[Path] = []
    if isinstance(input_roots, list):
        for p in input_roots:
            if p and str(p).strip():
                vault_roots.append(Path(str(p).strip()))
    elif isinstance(input_roots, str) and input_roots.strip():
        vault_roots.append(Path(input_roots.strip()))

    if not vault_roots:
        lp_res = await db.execute(select(LibraryPath.path))
        for row in lp_res.scalars().all():
            if row and row.strip():
                vault_roots.append(Path(row.strip()))

    if not vault_roots:
        base_setting = await get_setting(db, "base_library_path")
        if base_setting and base_setting.value and base_setting.value.strip():
            vault_roots.append(Path(base_setting.value.strip()))

    return vault_roots
