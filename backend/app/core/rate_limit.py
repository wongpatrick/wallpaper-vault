"""
Centralized rate limiting configuration using SlowAPI for demo mode environments.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.core.config import settings

limiter = Limiter(
    key_func=get_remote_address,
    enabled=settings.DEMO_MODE,
)
