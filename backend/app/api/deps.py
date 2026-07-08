"""
Dependencies for the API endpoints, including security and authentication.
"""
from fastapi import Header, Query, HTTPException, status
from app.core.config import settings
import secrets

async def verify_api_key(
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    api_key: str | None = Query(None)
) -> None:
    """
    Dependency to verify incoming requests against the configured API_KEY.
    If settings.API_KEY is not set (empty/None), authentication checks are skipped.
    Supports API keys passed via the X-API-Key header or api_key query parameter.
    """
    if not settings.API_KEY:
        # API security is disabled for local-only setups
        return

    provided_key = x_api_key or api_key

    if not provided_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Missing API Key"
        )

    # Use constant-time comparison to prevent timing attacks
    if not secrets.compare_digest(provided_key, settings.API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Invalid API Key"
        )
