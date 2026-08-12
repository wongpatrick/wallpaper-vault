"""
API endpoints for managing application settings, configurations, and disk caches.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.crud import settings as crud_settings
from app.schemas import settings as schema_settings
from app.schemas import cache as schema_cache
from app.services import cache_service

router = APIRouter()

# ---------------------------------------------------------
# Cache Management Endpoints
# ---------------------------------------------------------

@router.get("/cache", response_model=schema_cache.CacheStatsResponse)
async def read_cache_stats() -> schema_cache.CacheStatsResponse:
    """
    Retrieve aggregated disk cache statistics for AI models and image thumbnails.
    """
    return cache_service.get_all_cache_stats()


@router.post("/cache/ai-models/status", response_model=schema_cache.ModelStatusResponse)
async def check_ai_model_status(
    payload: schema_cache.ModelStatusRequest,
) -> schema_cache.ModelStatusResponse:
    """
    Check if a specific AI model configuration is downloaded and cached locally.
    """
    return cache_service.check_model_status(
        model_source=payload.model_source,
        model_type=payload.model_type,
        custom_repo=payload.custom_repo,
        custom_path=payload.custom_path,
    )


@router.post("/cache/ai-models/download", response_model=schema_cache.DownloadModelResponse)
async def download_ai_model(
    payload: schema_cache.DownloadModelRequest,
) -> schema_cache.DownloadModelResponse:
    """
    Pre-download AI model weights and tag definitions into local storage cache.
    """
    try:
        return cache_service.download_model(
            model_source=payload.model_source,
            model_type=payload.model_type,
            custom_repo=payload.custom_repo,
            custom_path=payload.custom_path,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to download model: {str(e)}")


@router.delete("/cache/ai-models", response_model=schema_cache.ClearCacheResponse)
async def clear_ai_models_cache() -> schema_cache.ClearCacheResponse:
    """
    Clear downloaded AI model files from disk cache and unload active inference sessions from memory.
    """
    try:
        return cache_service.clear_ai_models_cache()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear AI models cache: {str(e)}")


@router.delete("/cache/thumbnails", response_model=schema_cache.ClearCacheResponse)
async def clear_thumbnails_cache() -> schema_cache.ClearCacheResponse:
    """
    Clear generated image thumbnails from disk cache.
    """
    try:
        return cache_service.clear_thumbnail_cache()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear thumbnail cache: {str(e)}")


# ---------------------------------------------------------
# Application Configuration Settings Endpoints
# ---------------------------------------------------------

@router.get("/", response_model=List[schema_settings.Setting])
async def read_settings(
    db: AsyncSession = Depends(get_db)
) -> List[schema_settings.Setting]:
    """
    Retrieve all settings.
    """
    return await crud_settings.get_settings(db)


@router.get("/{key}", response_model=schema_settings.Setting)
async def read_setting(
    key: str,
    db: AsyncSession = Depends(get_db)
) -> schema_settings.Setting:
    """
    Get a specific setting by key.
    """
    db_setting = await crud_settings.get_setting(db, key=key)
    if not db_setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    return db_setting


@router.put("/{key}", response_model=schema_settings.Setting)
async def update_setting(
    key: str,
    setting: schema_settings.SettingUpdate,
    db: AsyncSession = Depends(get_db)
) -> schema_settings.Setting:
    """
    Update or create an application configuration setting.
    
    If the setting key already exists, its value and description are updated. If it does not exist, a new configuration key is created. This allows dynamic reconfiguration of paths and app behavior.
    """
    if key == "ai_model_source":
        val = setting.value.strip()
        if val not in ["predefined", "huggingface", "local"]:
            raise HTTPException(status_code=400, detail="Invalid model source. Must be 'predefined', 'huggingface', or 'local'.")
    elif key == "ai_model_custom_path":
        from pathlib import Path
        path_str = setting.value.strip()
        if path_str:
            path = Path(path_str)
            if not path.exists():
                raise HTTPException(status_code=400, detail="The custom path does not exist.")
            if not path.is_dir():
                raise HTTPException(status_code=400, detail="The custom path must be a directory.")
            
            # Check for at least one .onnx and one .csv file
            try:
                files = list(path.glob("*"))
                has_onnx = any(f.suffix.lower() == ".onnx" for f in files)
                has_csv = any(f.suffix.lower() == ".csv" for f in files)
                if not (has_onnx and has_csv):
                    raise HTTPException(
                        status_code=400, 
                        detail="The directory must contain at least one '.onnx' file and one '.csv' file."
                    )
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Failed to read directory contents: {e}")
    elif key == "ai_model_custom_repo":
        import re
        repo_id = setting.value.strip()
        if repo_id:
            if not re.match(r"^[^/\s]+/[^/\s]+$", repo_id):
                raise HTTPException(status_code=400, detail="Invalid Hugging Face Repository ID format. Must be 'username/repo'.")
            
            # Optional API verification
            from huggingface_hub import HfApi
            from huggingface_hub.utils import RepositoryNotFoundError, HFValidationError
            api = HfApi()
            try:
                api.model_info(repo_id)
            except RepositoryNotFoundError:
                raise HTTPException(status_code=400, detail=f"Hugging Face repository '{repo_id}' not found.")
            except HFValidationError:
                raise HTTPException(status_code=400, detail="Invalid Hugging Face Repository ID.")
            except Exception:
                # Accept format if offline/timeout
                pass
                
    updated_setting = await crud_settings.update_setting(db, key=key, setting=setting)
    await db.commit()
    if key.startswith("wallpaper_rotation_") or key == "favorite_rotation_probability":
        from app.core.rotation import rotation_broadcaster
        await rotation_broadcaster.broadcast({"event": "ping"})
    return updated_setting
