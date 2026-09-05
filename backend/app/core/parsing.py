"""
Parsing utilities for set folder names and templates.
"""

import re

# Standard Unicode-aware dash regex splitting creators from set titles
DASH_SPLIT_PATTERN = re.compile(
    r'\s+[-\u2010-\u2015\uff0d–—]\s+|\s*[\u2010-\u2015\uff0d–—]\s*'
)
FALLBACK_DASH_SPLIT_PATTERN = re.compile(
    r'\s*[-\u2010-\u2015\uff0d–—]\s*'
)


def parse_set_folder_name(folder_name: str) -> tuple[str, str]:
    """Parse folder name into (creator_name, set_title).

    Returns:
        tuple[str, str]: (creator_name, set_title) where creator defaults to "Unknown"
        if no separating dash is found.
    """
    parts = DASH_SPLIT_PATTERN.split(folder_name, maxsplit=1)
    if len(parts) <= 1:
        parts = FALLBACK_DASH_SPLIT_PATTERN.split(folder_name, maxsplit=1)
    if len(parts) > 1 and parts[0].strip():
        return parts[0].strip(), parts[1].strip()
    return "Unknown", folder_name.strip()
