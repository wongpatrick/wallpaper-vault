"""
Shared application constants and magic values.
"""

THUMBNAIL_SIZES: tuple[str, ...] = ("sm", "md", "lg")

PRESET_SWATCHES: list[str] = [
    '#E03131', '#E8590C', '#F08C00', '#2F9E44', '#0C8599',
    '#1971C2', '#6741D9', '#C2255C', '#F8F9FA', '#868E96', '#212529'
]

WHITE_LIGHTNESS_THRESHOLD: int = 85
BLACK_LIGHTNESS_THRESHOLD: int = 15
GREY_SATURATION_THRESHOLD: int = 20

COLOR_HUE_MAP: dict[str, int] = {
    'red': 0,
    'orange': 30,
    'yellow': 60,
    'green': 120,
    'teal': 180,
    'blue': 210,
    'purple': 270,
    'pink': 330,
}
