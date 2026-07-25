"""
Log sanitization and formatting utility helpers.
"""
from typing import Any


def safe_log_val(val: Any) -> Any:
    """Recursively converts strings to ASCII backslash-replaced representation to prevent UnicodeEncodeError in console/loggers."""
    if isinstance(val, str):
        return val.encode('ascii', 'backslashreplace').decode('ascii')
    elif isinstance(val, list):
        return [safe_log_val(x) for x in val]
    elif isinstance(val, dict):
        return {safe_log_val(k): safe_log_val(v) for k, v in val.items()}
    return val
