"""
Dependencies for the API endpoints, including security and authentication.
"""
from dataclasses import dataclass
import secrets
from fastapi import Header, Query, HTTPException, status
from app.core.config import settings


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


@dataclass
class PaginationParams:

    skip: int
    limit: int

def pagination_params(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=10000, description="Maximum number of records to return (max 10000)")
) -> PaginationParams:
    """Dependency for standard pagination with default limit=100, max limit=10000."""
    return PaginationParams(skip=skip, limit=limit)

def pagination_params_50(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=10000, description="Maximum number of records to return (max 10000)")
) -> PaginationParams:
    """Dependency for pagination with default limit=50, max limit=10000."""
    return PaginationParams(skip=skip, limit=limit)

