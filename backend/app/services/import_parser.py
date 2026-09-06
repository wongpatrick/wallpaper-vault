"""
Import candidate gathering, regex compilation, and folder parsing.
"""

from pathlib import Path
import re
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.core.parsing import DASH_SPLIT_PATTERN, FALLBACK_DASH_SPLIT_PATTERN
from app.crud.creator import get_creator_by_name
from app.crud.settings import get_setting
from app.schemas.set import BatchImportItem, BatchImportRequest

logger = structlog.get_logger(__name__)


async def gather_candidates(
    db: AsyncSession, batch_in: BatchImportRequest
) -> list[dict]:
    """Phase 1: Gather potential folders for import."""
    candidates = []
    if batch_in.scan_auto_path:
        parse_setting = await get_setting(db, "auto_parse_path")
        if parse_setting and parse_setting.value:
            scan_root = Path(parse_setting.value)
            if scan_root.exists() and scan_root.is_dir():
                for item in scan_root.iterdir():
                    if item.is_dir():
                        candidates.append(
                            {"path": str(item.resolve()), "name": item.name}
                        )

    for item in batch_in.items:
        candidates.append(
            {
                "path": item.source_path,
                "name": Path(item.source_path).name,
                "creator_name": item.creator_name,
                "set_title": item.set_title,
                "delete_source": item.delete_source,
                "auto_orient": item.auto_orient,
            }
        )
    return candidates


def compile_parsing_regex(template: str) -> re.Pattern | None:
    """Helper to compile user-provided templates into regex."""
    if not template:
        return None
    try:
        if "(?P<creator" in template or "(?P<set" in template:
            return re.compile(template)

        pattern = re.escape(template)
        pattern = re.sub(
            r"(?:\\ |\s)*\\-(?:\\ |\s)*",
            lambda m: r"(?:\s+[-\u2010-\u2015\uff0d–—]\s+|\s*[\u2010-\u2015\uff0d–—]\s*)",
            pattern,
        )
        for tag, group_prefix in [
            ("\\[Creator\\]", "creator"),
            ("\\[Set\\]", "set"),
        ]:
            count = 0
            while tag in pattern:
                pattern = pattern.replace(
                    tag, f"(?P<{group_prefix}_{count}>.+?)", 1
                )
                count += 1
        compiled = re.compile(f"^{pattern}$")
        return compiled
    except Exception as e:
        logger.error("Error compiling template", error=str(e), exc_info=True)
        return None


async def parse_and_validate_candidates(
    db: AsyncSession,
    candidates: list[dict],
    regex: re.Pattern | None,
) -> list[BatchImportItem]:
    """Phase 2: Parse folder names and validate against existing records."""
    from app.crud.set import get_set_by_title_and_creators

    results = []
    for cand in candidates:
        path = cand["path"]
        name = cand["name"]
        creator = cand.get("creator_name")
        title = cand.get("set_title")
        is_valid = True

        if not creator or not title:
            if regex:
                m = regex.match(name)
                if m:
                    c_parts = [
                        v
                        for k, v in m.groupdict().items()
                        if k.startswith("creator_") and v
                    ]
                    if c_parts:
                        creator = creator or " & ".join(
                            [p.strip() for p in c_parts]
                        )
                    elif "creator" in m.groupdict():
                        creator = creator or m.group("creator")

                    s_parts = [
                        v
                        for k, v in m.groupdict().items()
                        if k.startswith("set_") and v
                    ]
                    if s_parts:
                        title = title or " ".join([p.strip() for p in s_parts])
                    elif "set" in m.groupdict():
                        title = title or m.group("set")

            # Fallback dash-split using consolidated regexes
            if not creator or not title:
                parts = DASH_SPLIT_PATTERN.split(name, maxsplit=1)
                if len(parts) <= 1:
                    parts = FALLBACK_DASH_SPLIT_PATTERN.split(name, maxsplit=1)
                if len(parts) > 1:
                    creator = creator or parts[0].strip()
                    title = title or parts[1].strip()
                    is_valid = True
                elif not regex:
                    is_valid = False

        item_result = BatchImportItem(
            source_path=path,
            creator_name=creator or "Unknown",
            set_title=title or "Unknown",
            is_valid=is_valid,
            status="pending",
        )

        if is_valid and creator and title:
            raw_names = re.split(r"\s*[\&＆,/+]\s*", item_result.creator_name)
            creator_names = [n.strip() for n in raw_names if n.strip()]

            creator_ids = []
            all_resolved = True
            for cname in creator_names:
                c = await get_creator_by_name(db, cname)
                if c:
                    creator_ids.append(c.id)
                else:
                    all_resolved = False

            if all_resolved and len(creator_ids) == len(creator_names):
                existing = await get_set_by_title_and_creators(
                    db, item_result.set_title, creator_ids, load_relations=False
                )
                if existing:
                    item_result.status = "duplicate"
                    item_result.error = "Already in vault"

        results.append(item_result)
    return results
