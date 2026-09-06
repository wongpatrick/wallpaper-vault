"""
Service for managing application disk caches (AI models and preview thumbnails).
Provides inspection, pre-download, and cache cleanup operations.
"""
import shutil
import structlog

from app.schemas.cache import (
    AiModelCacheStats,
    CachedModelInfo,
    CacheStatsResponse,
    ClearCacheResponse,
    DownloadModelResponse,
    ModelStatusResponse,
    ThumbnailCacheStats,
)
from app.core.constants import THUMBS_DIR
from app.services.ai_tagging import (
    clear_tagger_instances,
    download_model_files,
    get_app_models_dir,
    is_model_cached,
    resolve_model_identifier,
)

logger = structlog.get_logger(__name__)


BYTES_PER_KB = 1024.0


def format_bytes(num_bytes: int) -> str:
    """Format bytes into a human-readable string representation."""
    if num_bytes <= 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB"]
    unit_idx = 0
    size = float(num_bytes)
    while size >= BYTES_PER_KB and unit_idx < len(units) - 1:
        size /= BYTES_PER_KB
        unit_idx += 1
    if unit_idx == 0:
        return f"{int(size)} B"
    return f"{size:.2f} {units[unit_idx]}"


def get_ai_models_cache_stats() -> AiModelCacheStats:
    """Scans the models storage directory and computes cache size and model details."""
    models_dir = get_app_models_dir()
    if not models_dir.exists() or not models_dir.is_dir():
        return AiModelCacheStats(
            total_bytes=0,
            human_size="0 B",
            model_count=0,
            models=[]
        )

    model_infos = []
    total_bytes = 0

    for item in models_dir.iterdir():
        if item.is_dir() and item.name.startswith("models--"):
            # Extract human-readable repo name from folder: models--org--repo -> org/repo
            raw_name = item.name[len("models--"):]
            parts = raw_name.split("--")
            repo_name = "/".join(parts) if len(parts) > 1 else raw_name

            dir_size = sum(f.stat().st_size for f in item.rglob("*") if f.is_file())
            total_bytes += dir_size
            model_infos.append(
                CachedModelInfo(
                    name=repo_name,
                    size_bytes=dir_size,
                    human_size=format_bytes(dir_size)
                )
            )

    # Sort models by size descending
    model_infos.sort(key=lambda m: m.size_bytes, reverse=True)

    return AiModelCacheStats(
        total_bytes=total_bytes,
        human_size=format_bytes(total_bytes),
        model_count=len(model_infos),
        models=model_infos
    )


def check_model_status(
    model_source: str = "predefined",
    model_type: str = "wd_eva02_large_v3",
    custom_repo: str = None,
    custom_path: str = None
) -> ModelStatusResponse:
    """Checks whether a specific model configuration is downloaded and cached."""
    repo_name = resolve_model_identifier(model_source, model_type, custom_repo, custom_path)
    cached, size_bytes = is_model_cached(model_source, model_type, custom_repo, custom_path)
    return ModelStatusResponse(
        is_cached=cached,
        model_name=repo_name,
        size_bytes=size_bytes,
        human_size=format_bytes(size_bytes)
    )


def download_model(
    model_source: str = "predefined",
    model_type: str = "wd_eva02_large_v3",
    custom_repo: str = None,
    custom_path: str = None
) -> DownloadModelResponse:
    """Pre-downloads model weights and tag mapping files into the local cache."""
    repo_name = resolve_model_identifier(model_source, model_type, custom_repo, custom_path)
    try:
        _, _, total_size = download_model_files(
            model_source=model_source,
            model_type=model_type,
            custom_repo=custom_repo,
            custom_path=custom_path
        )
        return DownloadModelResponse(
            success=True,
            model_name=repo_name,
            size_bytes=total_size,
            human_size=format_bytes(total_size),
            message=f"Model '{repo_name}' downloaded successfully."
        )
    except Exception as e:
        logger.error("Failed to download model", repo=repo_name, error=str(e))
        raise e


def clear_ai_models_cache() -> ClearCacheResponse:
    """Unloads active ONNX sessions and wipes the AI models storage folder."""
    # 1. Unload memory instances so Windows does not lock the .onnx files
    clear_tagger_instances()

    models_dir = get_app_models_dir()
    if not models_dir.exists() or not models_dir.is_dir():
        return ClearCacheResponse(
            freed_bytes=0,
            human_freed_size="0 B",
            message="AI model cache is already empty."
        )

    # Calculate total size before deletion
    freed_bytes = sum(f.stat().st_size for f in models_dir.rglob("*") if f.is_file())

    try:
        for item in models_dir.iterdir():
            if item.is_dir():
                shutil.rmtree(item, ignore_errors=True)
            elif item.is_file():
                try:
                    item.unlink()
                except Exception:
                    pass
        logger.info("Cleared AI model cache", freed_bytes=freed_bytes)
    except Exception as e:
        logger.error("Error clearing AI models cache directory", error=str(e))
        raise e

    return ClearCacheResponse(
        freed_bytes=freed_bytes,
        human_freed_size=format_bytes(freed_bytes),
        message=f"Successfully cleared AI models cache, freeing {format_bytes(freed_bytes)}."
    )


def get_thumbnail_cache_stats() -> ThumbnailCacheStats:
    """Calculates disk space consumed by cached thumbnail images."""
    if not THUMBS_DIR.exists() or not THUMBS_DIR.is_dir():
        return ThumbnailCacheStats(
            total_bytes=0,
            human_size="0 B",
            file_count=0
        )

    files = [f for f in THUMBS_DIR.iterdir() if f.is_file()]
    total_bytes = sum(f.stat().st_size for f in files)
    return ThumbnailCacheStats(
        total_bytes=total_bytes,
        human_size=format_bytes(total_bytes),
        file_count=len(files)
    )


def clear_thumbnail_cache() -> ClearCacheResponse:
    """Deletes all generated image thumbnails in the cache directory."""
    if not THUMBS_DIR.exists() or not THUMBS_DIR.is_dir():
        return ClearCacheResponse(
            freed_bytes=0,
            human_freed_size="0 B",
            message="Thumbnail cache is already empty."
        )

    files = [f for f in THUMBS_DIR.iterdir() if f.is_file()]
    freed_bytes = sum(f.stat().st_size for f in files)

    deleted_count = 0
    for f in files:
        try:
            f.unlink()
            deleted_count += 1
        except Exception as e:
            logger.warning("Failed to delete thumbnail file", file=str(f), error=str(e))

    logger.info("Cleared thumbnail cache", deleted_count=deleted_count, freed_bytes=freed_bytes)
    return ClearCacheResponse(
        freed_bytes=freed_bytes,
        human_freed_size=format_bytes(freed_bytes),
        message=f"Successfully cleared {deleted_count} thumbnails, freeing {format_bytes(freed_bytes)}."
    )


def get_all_cache_stats() -> CacheStatsResponse:
    """Aggregates all cache metrics across AI models and thumbnails."""
    return CacheStatsResponse(
        ai_models=get_ai_models_cache_stats(),
        thumbnails=get_thumbnail_cache_stats()
    )
