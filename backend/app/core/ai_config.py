"""
AI Tagging configuration data structure and loader.
"""
from dataclasses import dataclass
from typing import Any, Optional
import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from app.crud.settings import get_setting
from app.core.log_utils import safe_log_val

logger = structlog.get_logger(__name__)


@dataclass
class AiTaggingConfig:
    enabled: bool
    model_source: str
    model_type: str
    custom_repo: Optional[str]
    custom_path: Optional[str]
    confidence_threshold: float
    rollup_threshold: float
    tagger: Optional[Any] = None

    def to_dict(self) -> dict[str, Any]:
        """Convert dataclass instance to a dictionary representation."""
        return {
            "enabled": self.enabled,
            "model_source": self.model_source,
            "model_type": self.model_type,
            "custom_repo": self.custom_repo,
            "custom_path": self.custom_path,
            "confidence_threshold": self.confidence_threshold,
            "rollup_threshold": self.rollup_threshold,
            "tagger": self.tagger,
        }


async def load_ai_tagging_config(db: AsyncSession, init_tagger: bool = True) -> AiTaggingConfig:
    """Loads AI auto-tagging settings and optionally instantiates the tagger if enabled."""
    auto_tag_setting = await get_setting(db, "ai_auto_tag_enabled")
    auto_tag_enabled = (
        auto_tag_setting.value.lower() in ("true", "1", "yes")
        if auto_tag_setting and auto_tag_setting.value
        else False
    )

    model_source_setting = await get_setting(db, "ai_model_source")
    model_source = (
        model_source_setting.value
        if model_source_setting and model_source_setting.value
        else "predefined"
    )

    model_type_setting = await get_setting(db, "ai_model_type")
    model_type = (
        model_type_setting.value
        if model_type_setting and model_type_setting.value
        else "wd14_onnx"
    )

    custom_repo_setting = await get_setting(db, "ai_model_custom_repo")
    custom_repo = (
        custom_repo_setting.value
        if custom_repo_setting and custom_repo_setting.value
        else None
    )

    custom_path_setting = await get_setting(db, "ai_model_custom_path")
    custom_path = (
        custom_path_setting.value
        if custom_path_setting and custom_path_setting.value
        else None
    )

    confidence_setting = await get_setting(db, "ai_confidence_threshold")
    try:
        confidence_threshold = (
            float(confidence_setting.value)
            if confidence_setting and confidence_setting.value
            else 0.35
        )
    except (ValueError, TypeError):
        confidence_threshold = 0.35

    rollup_threshold_setting = await get_setting(db, "ai_rollup_threshold")
    try:
        rollup_threshold = (
            float(rollup_threshold_setting.value)
            if rollup_threshold_setting and rollup_threshold_setting.value
            else 0.3
        )
    except (ValueError, TypeError):
        rollup_threshold = 0.3

    tagger = None
    if auto_tag_enabled and init_tagger:
        try:
            from app.services.ai_tagging import get_tagger
            tagger = get_tagger(
                model_source=model_source,
                model_type=model_type,
                custom_repo=custom_repo,
                custom_path=custom_path
            )
        except Exception as tagger_err:
            logger.error("Failed to initialize AI tagger", error=safe_log_val(str(tagger_err)))
            auto_tag_enabled = False

    return AiTaggingConfig(
        enabled=auto_tag_enabled,
        model_source=model_source,
        model_type=model_type,
        custom_repo=custom_repo,
        custom_path=custom_path,
        confidence_threshold=confidence_threshold,
        rollup_threshold=rollup_threshold,
        tagger=tagger,
    )
