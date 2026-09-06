"""
AI auto-tagging orchestration for Sets.
"""

import asyncio
from pathlib import Path
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import structlog

from app.core import tasks
from app.core.ai_config import load_ai_tagging_config
from app.core.enums import TaskStatus
from app.core.log_utils import safe_log_val as _safe_log_val
from app.crud import set as crud_set
from app.crud.character import get_characters_by_names
from app.crud.tag import get_tags_by_names
from app.db.session import SessionLocal
from app.models.image import Image as ImageModel
from app.models.set import Set
from app.services import ai_tagging

logger = structlog.get_logger(__name__)


async def auto_tag_set(
    db: AsyncSession, set_id: int, task_id: Optional[str] = None
) -> Optional[Set]:
    """Manually run AI auto-tagging on an existing Set."""
    stmt = (
        select(Set)
        .options(
            selectinload(Set.images).selectinload(ImageModel.tags),
            selectinload(Set.tags),
            selectinload(Set.characters),
        )
        .where(Set.id == set_id)
    )
    result = await db.execute(stmt)
    db_set = result.scalars().first()
    if not db_set:
        if task_id:
            await tasks.update_task(
                db, task_id, status=TaskStatus.ERROR, error_message="Set not found"
            )
        return None

    try:
        ai_cfg = await load_ai_tagging_config(db, init_tagger=False)
        model_source = ai_cfg.model_source
        model_type = ai_cfg.model_type
        custom_repo = ai_cfg.custom_repo
        custom_path = ai_cfg.custom_path
        confidence_threshold = ai_cfg.confidence_threshold
        rollup_threshold = ai_cfg.rollup_threshold

        logger.info(
            "Executing manual Set auto-tagging",
            set_id=set_id,
            set_title=_safe_log_val(db_set.title),
            model_type=_safe_log_val(model_type),
            confidence_threshold=confidence_threshold,
            rollup_threshold=rollup_threshold,
        )

        tagger = ai_tagging.get_tagger(
            model_source=model_source,
            model_type=model_type,
            custom_repo=custom_repo,
            custom_path=custom_path,
        )
        all_detected_characters = set()

        if db_set.images:
            total_images = len(db_set.images)
            if task_id:
                await tasks.update_task(
                    db,
                    task_id,
                    status=TaskStatus.PROCESSING,
                    progress=0,
                    total=total_images,
                )

            for index, img in enumerate(db_set.images):
                if not img.local_path:
                    if task_id:
                        await tasks.update_task(db, task_id, progress=index + 1)
                    continue

                await db.refresh(img, ["tags", "characters"])

                p = Path(img.local_path)
                if not p.exists():
                    logger.warning(
                        "Skipping tagging for non-existent image path",
                        path=_safe_log_val(img.local_path),
                    )
                    if task_id:
                        await tasks.update_task(db, task_id, progress=index + 1)
                    continue

                try:
                    logger.info(
                        "Running AI auto-tagging on existing image",
                        path=_safe_log_val(img.local_path),
                    )
                    general_tags, character_tags = await asyncio.to_thread(
                        tagger.tag_image,
                        img.local_path,
                        threshold=confidence_threshold,
                    )

                    if character_tags:
                        for char_name in character_tags:
                            all_detected_characters.add(char_name)

                        image_characters_list = await get_characters_by_names(
                            db, character_tags
                        )
                        current_char_ids = {c.id for c in img.characters}
                        char_added_count = 0
                        for c in image_characters_list:
                            if c.id not in current_char_ids:
                                img.characters.append(c)
                                current_char_ids.add(c.id)
                                char_added_count += 1
                        logger.info(
                            "Merged characters to image record",
                            path=_safe_log_val(img.local_path),
                            total_associated=len(img.characters),
                            newly_added=char_added_count,
                        )

                    logger.info(
                        "AI tagging completed for image",
                        path=_safe_log_val(img.local_path),
                        general_tags=_safe_log_val(general_tags),
                        character_tags=_safe_log_val(character_tags),
                    )

                    if general_tags:
                        image_tags_list = await get_tags_by_names(
                            db, general_tags
                        )
                        current_tag_ids = {t.id for t in img.tags}
                        added_count = 0
                        for t in image_tags_list:
                            if t.id not in current_tag_ids:
                                img.tags.append(t)
                                current_tag_ids.add(t.id)
                                added_count += 1

                        logger.info(
                            "Merged tags to image record",
                            path=_safe_log_val(img.local_path),
                            total_associated=len(img.tags),
                            newly_added=added_count,
                        )
                except Exception as tag_err:
                    logger.error(
                        "Failed to run AI tagging on image during Set tag run",
                        path=_safe_log_val(img.local_path),
                        error=_safe_log_val(str(tag_err)),
                    )

                if task_id:
                    await tasks.update_task(db, task_id, progress=index + 1)

        if all_detected_characters:
            logger.info(
                "Resolving AI character tags for Set",
                set_title=_safe_log_val(db_set.title),
                characters=_safe_log_val(list(all_detected_characters)),
            )
            db_characters = await get_characters_by_names(
                db, list(all_detected_characters)
            )

            current_char_ids = {c.id for c in db_set.characters}
            char_added_count = 0
            for c in db_characters:
                if c.id not in current_char_ids:
                    db_set.characters.append(c)
                    current_char_ids.add(c.id)
                    char_added_count += 1
            logger.info(
                "Merged characters to Set",
                set_title=_safe_log_val(db_set.title),
                total_characters=len(db_set.characters),
                newly_added=char_added_count,
            )

        # Recalculate set rollup tags using consolidated method with additive=True
        await crud_set.recalculate_set_rollup_tags(
            db, set_id=db_set.id, additive=True
        )

        db.add(db_set)
        await db.commit()
        await db.refresh(db_set)

        if task_id:
            total_images = len(db_set.images) if db_set.images else 0
            await tasks.update_task(
                db,
                task_id,
                status=TaskStatus.COMPLETED,
                progress=total_images,
                total=total_images,
            )

        return await crud_set.get_set(db, set_id)

    except Exception as err:
        logger.error("Failed auto-tagging set", set_id=set_id, error=str(err))
        if task_id:
            await tasks.update_task(
                db, task_id, status=TaskStatus.ERROR, error_message=str(err)
            )
        raise err


async def run_auto_tag_set_background(set_id: int, task_id: str) -> None:
    """Background task to run AI auto-tagging on a Set."""
    async with SessionLocal() as db:
        try:
            await auto_tag_set(db, set_id=set_id, task_id=task_id)
        except Exception as e:
            logger.error(
                "Background auto-tagging set task failed",
                set_id=set_id,
                task_id=task_id,
                error=str(e),
            )
