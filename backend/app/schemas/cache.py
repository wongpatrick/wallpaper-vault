"""
Pydantic schemas for cache management, model status inspection, and pre-downloads.
"""
from typing import List, Optional
from pydantic import BaseModel, Field


class CachedModelInfo(BaseModel):
    """Information about an individual cached AI model."""
    name: str = Field(..., description="Name or Hugging Face repository identifier of the model.")
    size_bytes: int = Field(..., description="Disk size consumed by the model in bytes.")
    human_size: str = Field(..., description="Human-readable formatted disk size (e.g. '1.34 GB').")


class AiModelCacheStats(BaseModel):
    """Aggregated cache statistics for AI models."""
    total_bytes: int = Field(..., description="Total size in bytes of all cached AI models.")
    human_size: str = Field(..., description="Formatted total size of AI models cache.")
    model_count: int = Field(..., description="Number of unique AI models cached locally.")
    models: List[CachedModelInfo] = Field(default_factory=list, description="List of cached model details.")


class ThumbnailCacheStats(BaseModel):
    """Aggregated cache statistics for generated image thumbnails."""
    total_bytes: int = Field(..., description="Total size in bytes of all cached thumbnails.")
    human_size: str = Field(..., description="Formatted total size of thumbnail cache.")
    file_count: int = Field(..., description="Total number of cached thumbnail image files.")


class CacheStatsResponse(BaseModel):
    """Full application cache metrics."""
    ai_models: AiModelCacheStats = Field(..., description="AI model cache statistics.")
    thumbnails: ThumbnailCacheStats = Field(..., description="Thumbnail cache statistics.")


class ModelStatusRequest(BaseModel):
    """Request payload to query whether a specific model configuration is cached."""
    model_source: str = Field(default="predefined", description="Model source ('predefined', 'huggingface', 'local').")
    model_type: Optional[str] = Field(default="wd_eva02_large_v3", description="Predefined model identifier.")
    custom_repo: Optional[str] = Field(default=None, description="Hugging Face repo identifier if source is 'huggingface'.")
    custom_path: Optional[str] = Field(default=None, description="Local folder path if source is 'local'.")


class ModelStatusResponse(BaseModel):
    """Response payload detailing local cache status of a model."""
    is_cached: bool = Field(..., description="Whether the model files are already available locally.")
    model_name: str = Field(..., description="Resolved model repository name or path.")
    size_bytes: int = Field(default=0, description="Size of the cached model files in bytes (0 if not cached).")
    human_size: str = Field(default="0 B", description="Formatted size of the cached model files.")


class DownloadModelRequest(BaseModel):
    """Request payload to trigger pre-downloading of an AI model."""
    model_source: str = Field(default="predefined", description="Model source ('predefined', 'huggingface', 'local').")
    model_type: Optional[str] = Field(default="wd_eva02_large_v3", description="Predefined model identifier.")
    custom_repo: Optional[str] = Field(default=None, description="Hugging Face repo identifier if source is 'huggingface'.")
    custom_path: Optional[str] = Field(default=None, description="Local folder path if source is 'local'.")


class DownloadModelResponse(BaseModel):
    """Response payload after downloading or verifying model files."""
    success: bool = Field(..., description="Whether the model files were downloaded or verified successfully.")
    model_name: str = Field(..., description="Resolved model identifier.")
    size_bytes: int = Field(..., description="Total size in bytes of the downloaded model files.")
    human_size: str = Field(..., description="Formatted size of the downloaded model files.")
    message: str = Field(..., description="Status explanation message.")


class ClearCacheResponse(BaseModel):
    """Response payload after clearing a cache."""
    freed_bytes: int = Field(..., description="Total bytes freed by the deletion operation.")
    human_freed_size: str = Field(..., description="Formatted string of freed storage (e.g. '1.2 GB').")
    message: str = Field(..., description="Success or informational message.")
