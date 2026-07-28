"""
Color conversion and matching utility functions.
"""
import colorsys
from typing import Optional
from app.core.constants import (
    BLACK_LIGHTNESS_THRESHOLD,
    COLOR_HUE_MAP,
    GREY_SATURATION_THRESHOLD,
    WHITE_LIGHTNESS_THRESHOLD,
)


def hex_to_hsl(hex_color: str) -> tuple[float, float, float]:
    """Converts hex color code to (hue: 0-360, saturation: 0-100, lightness: 0-100)."""
    hex_color = hex_color.lstrip('#')
    if len(hex_color) != 6:  # noqa: PLR2004
        return 0.0, 0.0, 0.0
    try:
        r = int(hex_color[0:2], 16) / 255.0
        g = int(hex_color[2:4], 16) / 255.0
        b = int(hex_color[4:6], 16) / 255.0
    except ValueError:
        return 0.0, 0.0, 0.0
    hue, light, sat = colorsys.rgb_to_hls(r, g, b)
    return hue * 360.0, sat * 100.0, light * 100.0


def get_color_bucket(hex_color: Optional[str]) -> Optional[str]:
    """Categorizes a hex color code into a predefined coarse color bucket name."""
    if not hex_color:
        return None
    hue, sat, light = hex_to_hsl(hex_color)

    if light > WHITE_LIGHTNESS_THRESHOLD:
        return "white"
    if light < BLACK_LIGHTNESS_THRESHOLD:
        return "black"
    if sat <= GREY_SATURATION_THRESHOLD:
        return "grey"

    # Hue classification (0-360)
    if hue < 15.0 or hue >= 345.0:  # noqa: PLR2004
        return "red"
    if hue < 45.0:  # noqa: PLR2004
        return "orange"
    if hue < 75.0:  # noqa: PLR2004
        return "yellow"
    if hue < 150.0:  # noqa: PLR2004
        return "green"
    if hue < 195.0:  # noqa: PLR2004
        return "teal"
    if hue < 255.0:  # noqa: PLR2004
        return "blue"
    if hue < 300.0:  # noqa: PLR2004
        return "purple"
    return "pink"


def resolve_target_color_bucket(target_color: str) -> Optional[str]:
    """Resolves a target search string (hex swatch or name) to a dominant_color_bucket value."""
    if not target_color:
        return None
    target = target_color.strip()
    if target.startswith('#') or (len(target) == 6 and all(c in '0123456789abcdefABCDEF' for c in target)):  # noqa: PLR2004
        return get_color_bucket(target)
    target_lower = target.lower()
    valid_buckets = {'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'white', 'grey', 'black'}
    if target_lower in valid_buckets:
        return target_lower
    return None


def matches_color(dominant_color: Optional[str], target_color: str, hue_tolerance: int = 30) -> bool:
    """Checks whether a dominant color matches a target color (hex swatch or named color bucket)."""
    if not dominant_color:
        return False
    hue, sat, light = hex_to_hsl(dominant_color)
    
    target = target_color.strip()
    
    if target.startswith('#'):
        target_h, target_s, target_l = hex_to_hsl(target)
        
        if target_l > WHITE_LIGHTNESS_THRESHOLD:
            return light > WHITE_LIGHTNESS_THRESHOLD
        if target_l < BLACK_LIGHTNESS_THRESHOLD:
            return light < BLACK_LIGHTNESS_THRESHOLD
        if target_s <= GREY_SATURATION_THRESHOLD:
            return sat <= GREY_SATURATION_THRESHOLD and BLACK_LIGHTNESS_THRESHOLD <= light <= WHITE_LIGHTNESS_THRESHOLD
        
        diff = abs(hue - target_h)
        diff = min(diff, 360.0 - diff)
        return diff <= hue_tolerance
    
    target_lower = target.lower()
    if target_lower == 'white':
        return light > WHITE_LIGHTNESS_THRESHOLD
    if target_lower == 'black':
        return light < BLACK_LIGHTNESS_THRESHOLD
    if target_lower == 'grey':
        return sat <= GREY_SATURATION_THRESHOLD and BLACK_LIGHTNESS_THRESHOLD <= light <= WHITE_LIGHTNESS_THRESHOLD
        
    if target_lower not in COLOR_HUE_MAP:
        return False
        
    target_h = float(COLOR_HUE_MAP[target_lower])
    diff = abs(hue - target_h)
    diff = min(diff, 360.0 - diff)
    return diff <= hue_tolerance

