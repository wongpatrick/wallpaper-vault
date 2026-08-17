"""
Middleware for enforcing read-only sandbox mode in hosted demo environments.
"""
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from app.core.config import settings


class DemoSandboxMiddleware(BaseHTTPMiddleware):
    """
    Middleware that rejects state-modifying requests (POST, PUT, PATCH, DELETE)
    when demo mode is enabled.
    """

    SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
    EXEMPT_PATHS = {"/health", "/api/health", "/"}

    async def dispatch(self, request: Request, call_next) -> Response:
        if not settings.DEMO_MODE:
            return await call_next(request)

        if request.method not in self.SAFE_METHODS and request.url.path not in self.EXEMPT_PATHS:
            return JSONResponse(
                status_code=403,
                content={"detail": "This is a read-only demo. State-modifying operations are disabled."},
            )
        return await call_next(request)
