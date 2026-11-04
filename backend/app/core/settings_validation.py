"""
Validation helpers for application settings and rotation configurations.
"""
import re
from typing import Optional

ROTATION_MODE_PATTERN = re.compile(r"^(monitor_\d+_)?wallpaper_rotation_mode$")
ALLOWED_ROTATION_MODES = {"displayfusion", "native"}


def validate_rotation_setting(key: str, value: Optional[str]) -> None:
    """
    Validate that rotation-related settings conform to allowed values.

    Raises:
        ValueError: If key is a rotation mode setting and value is not allowed.
    """
    if ROTATION_MODE_PATTERN.match(key):
        norm_val = (value or "").strip().lower()
        if norm_val not in ALLOWED_ROTATION_MODES:
            raise ValueError(
                f"Invalid rotation mode '{value}'. Allowed values are: {', '.join(sorted(ALLOWED_ROTATION_MODES))}."
            )
