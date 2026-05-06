import re

def sanitize_filename(filename: str) -> str:
    """Removes or replaces characters that are illegal in Windows/Unix filenames."""
    # Replace reserved characters with a dash
    # < > : " / \ | ? *
    sanitized = re.sub(r'[<>:"/\\|?*]', '-', filename)
    # Remove control characters
    sanitized = "".join(char for char in sanitized if ord(char) >= 32)
    # Trim whitespace and dots at the end (Windows doesn't like them)
    return sanitized.strip().strip('.')
