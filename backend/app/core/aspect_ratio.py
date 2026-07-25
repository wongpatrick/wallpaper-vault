"""
Aspect ratio utilities and default constants.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from app.crud.settings import get_setting

DEFAULT_HORIZONTAL_RATIO = "16x9"
DEFAULT_VERTICAL_RATIO = "9x16"


def parse_ratio(r_str: str, default: float) -> float:
    """Parses ratio string formatted like '16/9', '16x9', or float into a float ratio value."""
    if not r_str:
        return default
    try:
        if "/" in r_str:
            num, den = r_str.split("/")
            return float(num) / float(den)
        if "x" in r_str:
            num, den = r_str.split("x")
            return float(num) / float(den)
        return float(r_str)
    except (ValueError, TypeError, ZeroDivisionError):
        return default


async def get_aspect_ratio_labels(db: AsyncSession) -> tuple[str, str]:
    """Fetches horizontal and vertical target ratio settings from the DB,
    returning formatted labels with 'x' (e.g. ('16x9', '9x16')).
    """
    h_setting = await get_setting(db, "horizontal_target_ratio")
    v_setting = await get_setting(db, "vertical_target_ratio")
    
    h_raw = h_setting.value if h_setting and h_setting.value else "16/9"
    v_raw = v_setting.value if v_setting and v_setting.value else "9/16"
    
    h_label = h_raw.replace("/", "x")
    v_label = v_raw.replace("/", "x")
    return h_label, v_label
