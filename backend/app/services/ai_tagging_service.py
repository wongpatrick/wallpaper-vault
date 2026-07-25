"""
Service for AI auto-tagging configuration, execution, character resolution, and Set-level tag rollups.
"""
import asyncio
import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.ai_config import load_ai_tagging_config
from app.core.log_utils import safe_log_val

logger = structlog.get_logger(__name__)


async def get_ai_tagging_config(db: AsyncSession) -> dict:
    """Loads AI auto-tagging settings and instantiates the tagger if enabled."""
    cfg = await load_ai_tagging_config(db, init_tagger=True)
    return cfg.to_dict()



async def tag_image_file(
    db: AsyncSession,
    config: dict,
    image_path: str,
    detected_characters: set
) -> tuple[list, list]:
    """
    Executes AI tagging on a single image file if enabled in config.
    Populates detected_characters set and returns tuple of (image_tags_list, image_characters_list).
    """
    if not config.get("enabled") or not config.get("tagger"):
        return [], []

    tagger = config["tagger"]
    confidence_threshold = config["confidence_threshold"]
    model_type = config["model_type"]

    try:
        logger.info(
            "Running AI auto-tagging on image",
            path=safe_log_val(image_path),
            model=safe_log_val(model_type),
            confidence_threshold=confidence_threshold
        )
        general_tags, character_tags = await asyncio.to_thread(
            tagger.tag_image,
            image_path,
            threshold=confidence_threshold
        )

        if character_tags:
            for char_name in character_tags:
                detected_characters.add(char_name)

        logger.info(
            "AI tagging completed for image",
            path=safe_log_val(image_path),
            general_tags=safe_log_val(general_tags),
            character_tags=safe_log_val(character_tags),
            total_suggested=(len(general_tags) + len(character_tags))
        )

        image_tags_list = []
        if general_tags:
            from app.crud.tag import get_tags_by_names
            image_tags_list = await get_tags_by_names(db, general_tags)
            logger.info(
                "Associated tags to image record",
                path=safe_log_val(image_path),
                count=len(image_tags_list),
                tags=[safe_log_val(t.name) for t in image_tags_list]
            )

        image_characters_list = []
        if character_tags:
            from app.crud.character import get_characters_by_names
            image_characters_list = await get_characters_by_names(db, character_tags)
            logger.info(
                "Associated characters to image record",
                path=safe_log_val(image_path),
                count=len(image_characters_list),
                characters=[safe_log_val(c.name) for c in image_characters_list]
            )

        return image_tags_list, image_characters_list
    except Exception as tag_err:
        logger.error(
            "Failed to run AI tagging",
            path=safe_log_val(image_path),
            error=safe_log_val(str(tag_err))
        )
        return [], []


async def apply_set_tag_rollups(
    db: AsyncSession,
    db_set: object,
    db_images: list,
    detected_characters: set,
    rollup_threshold: float
) -> None:
    """
    Associates detected AI character tags and applies dynamic rollup threshold logic to promote
    frequently occurring image tags to the Set level.
    """
    if detected_characters:
        from app.crud.character import get_characters_by_names
        logger.info(
            "Resolving AI character tags for Set",
            set_title=safe_log_val(getattr(db_set, "title", "Unknown")),
            characters=safe_log_val(list(detected_characters))
        )
        db_characters = await get_characters_by_names(db, list(detected_characters))

        existing_chars = getattr(db_set, "characters", None) or []
        existing_char_ids = set(c.id for c in existing_chars)
        if getattr(db_set, "characters", None) is None:
            db_set.characters = []
        for char in db_characters:
            if char.id not in existing_char_ids:
                db_set.characters.append(char)

    if db_images:
        tag_counts = {}
        tag_objects = {}
        for img in db_images:
            for t in img.tags:
                tag_counts[t.name] = tag_counts.get(t.name, 0) + 1
                tag_objects[t.name] = t

        logger.info(
            "Computing Set rollup tags",
            set_title=safe_log_val(getattr(db_set, "title", "Unknown")),
            total_images=len(db_images),
            tag_frequencies=safe_log_val({
                name: f"{count}/{len(db_images)}"
                for name, count in tag_counts.items()
            })
        )

        existing_tags = getattr(db_set, "tags", None) or []
        rollup_tags = list(existing_tags)
        existing_set_tags = set(t.name for t in rollup_tags)
        num_images = len(db_images)
        for tag_name, count in tag_counts.items():
            freq = float(count) / num_images
            if freq >= rollup_threshold and tag_name not in existing_set_tags:
                logger.info(
                    "Promoting tag to Set level",
                    set_title=safe_log_val(getattr(db_set, "title", "Unknown")),
                    tag_name=safe_log_val(tag_name),
                    frequency=f"{freq:.2%}",
                    required=f"{rollup_threshold:.2%}"
                )
                rollup_tags.append(tag_objects[tag_name])

        db_set.tags = rollup_tags
