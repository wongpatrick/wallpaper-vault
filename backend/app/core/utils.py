"""
General utility functions and helpers for the application.
"""
import re

def sanitize_filename(filename: str) -> str:
    """Removes or replaces characters that are illegal in Windows/Unix filenames."""
    # Replace reserved characters with a dash
    # < > : " / \ | ? *
    sanitized = re.sub(r'[<>:"/\\|?*]', '-', filename)
    # Remove control characters (ASCII < 32)
    PRINTABLE_ASCII_START = 32
    sanitized = "".join(char for char in sanitized if ord(char) >= PRINTABLE_ASCII_START)
    # Trim whitespace and dots at the end (Windows doesn't like them)
    return sanitized.strip().strip('.')
