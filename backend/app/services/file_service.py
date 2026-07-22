"""
Service for file system operations, retry deletions, and recursive empty directory cleanups.
"""
from pathlib import Path
import os
import shutil
import time
import stat
import anyio
import structlog

logger = structlog.get_logger(__name__)


def safe_log_val(val):
    """Recursively convert strings to ASCII backslash-replaced representation to prevent UnicodeEncodeError in console."""
    if isinstance(val, str):
        return val.encode('ascii', 'backslashreplace').decode('ascii')
    elif isinstance(val, list):
        return [safe_log_val(x) for x in val]
    elif isinstance(val, dict):
        return {safe_log_val(k): safe_log_val(v) for k, v in val.items()}
    return val


def retry_delete_sync(path: Path, is_dir: bool = False, max_attempts: int = 5) -> tuple[bool, str | None]:
    """Synchronous helper that retries file/directory deletion with permission resets and delay."""
    if not path.exists():
        return True, None

    if is_dir:
        for attempt in range(max_attempts):
            try:
                shutil.rmtree(path)
                return True, None
            except FileNotFoundError:
                return True, None
            except (PermissionError, OSError) as e:
                if attempt < max_attempts - 1:
                    time.sleep(0.2)
                else:
                    return False, str(e)
    else:
        for attempt in range(max_attempts):
            try:
                try:
                    os.chmod(path, stat.S_IWRITE)
                except Exception:
                    pass
                path.unlink()
                return True, None
            except FileNotFoundError:
                return True, None
            except PermissionError as e:
                if attempt < max_attempts - 1:
                    time.sleep(0.2)
                else:
                    return False, str(e)
            except Exception as e:
                return False, str(e)
    return False, "Max attempts reached"


async def retry_delete(path: Path, is_dir: bool = False, max_attempts: int = 5) -> tuple[bool, str | None]:
    """Async wrapper for retry_delete_sync running off the main event loop."""
    return await anyio.to_thread.run_sync(retry_delete_sync, path, is_dir, max_attempts)


def delete_dir_if_empty(dir_path: Path) -> bool:
    """Recursively deletes a directory if it is empty or contains only empty subdirectories and ignored files."""
    if not dir_path.exists() or not dir_path.is_dir():
        return False

    ignored_names = {".ds_store", "thumbs.db", "desktop.ini"}
    max_attempts = 5

    try:
        # Bottom-up traversal of children
        for child in list(dir_path.iterdir()):
            if child.is_dir():
                delete_dir_if_empty(child)
            elif child.is_file() and child.name.lower() in ignored_names:
                for attempt in range(max_attempts):
                    try:
                        try:
                            os.chmod(child, stat.S_IWRITE)
                        except Exception:
                            pass
                        child.unlink()
                        break
                    except (PermissionError, OSError) as e:
                        if attempt < max_attempts - 1:
                            time.sleep(0.2)
                        else:
                            logger.warning("Failed to delete ignored file inside directory", path=str(child), error=str(e))

        # Now check if it's empty
        if not list(dir_path.iterdir()):
            for attempt in range(max_attempts):
                try:
                    try:
                        os.chmod(dir_path, stat.S_IWRITE)
                    except Exception:
                        pass
                    dir_path.rmdir()
                    return True
                except (PermissionError, OSError) as e:
                    if attempt < max_attempts - 1:
                        time.sleep(0.2)
                    else:
                        logger.warning("Failed to remove empty directory after retries", path=str(dir_path), error=str(e))
                        break
    except Exception as e:
        logger.error("Error occurred in delete_dir_if_empty", path=str(dir_path), error=str(e))
    return False


async def delete_dir_if_empty_async(dir_path: Path) -> bool:
    """Async wrapper for delete_dir_if_empty running off the main event loop."""
    return await anyio.to_thread.run_sync(delete_dir_if_empty, dir_path)


async def cleanup_source_directories(
    dropped_dirs: set[str],
    items_paths: list[str],
    parent_dirs: set[Path],
    vault_root: Path | None = None
) -> list[str]:
    """
    Cleans up empty source directories and parent folder structures after file deletion.
    Returns a list of folder names that could not be deleted because they still contained files.
    """
    cleanup_warnings = []

    # Clean dropped source directories
    for d_str in dropped_dirs:
        try:
            d_path = Path(d_str)
            if d_path.exists() and d_path.is_dir():
                if await delete_dir_if_empty_async(d_path):
                    logger.info("Deleted empty source directory", path=safe_log_val(d_str))
                else:
                    cleanup_warnings.append(d_path.name)
                    logger.info("Source directory not empty, leaving on disk", path=safe_log_val(d_str))
        except Exception as dir_err:
            logger.error("Failed to delete empty source directory", path=safe_log_val(d_str), error=str(dir_err))

    # Clean item local paths
    for p_str in items_paths:
        item_path = Path(p_str)
        if item_path.exists() and item_path.is_dir():
            try:
                if await delete_dir_if_empty_async(item_path):
                    logger.info("Deleted empty source item path", path=safe_log_val(str(item_path)))
                else:
                    folder_name = item_path.name
                    if folder_name not in cleanup_warnings:
                        cleanup_warnings.append(folder_name)
                        logger.info("Source item path not empty, leaving on disk", path=safe_log_val(str(item_path)))
            except Exception as err:
                logger.error("Failed to clean up source item path", path=safe_log_val(str(item_path)), error=str(err))

    # Clean up parent directories collected during per-file deletion (deepest first)
    sorted_parents = sorted(list(parent_dirs), key=lambda x: len(x.parts), reverse=True)
    for parent in sorted_parents:
        try:
            if parent.exists() and parent.is_dir():
                if await delete_dir_if_empty_async(parent):
                    logger.info("Deleted empty parent directory", path=safe_log_val(str(parent)))
                    # Recursively check and delete empty ancestor directories up the tree
                    ancestor = parent.parent
                    while ancestor and ancestor != ancestor.parent:
                        if not ancestor.exists() or not ancestor.is_dir():
                            break
                        if len(ancestor.parts) <= 1:
                            break
                        if vault_root and ancestor == vault_root:
                            break
                        if await delete_dir_if_empty_async(ancestor):
                            logger.info("Deleted empty ancestor directory", path=safe_log_val(str(ancestor)))
                            ancestor = ancestor.parent
                        else:
                            break
                else:
                    logger.info("Parent directory not empty, leaving on disk", path=safe_log_val(str(parent)))
        except Exception as dir_err:
            logger.error("Failed to delete empty parent directory", path=safe_log_val(str(parent)), error=str(dir_err))

    return cleanup_warnings
