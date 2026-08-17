"""
Main application entry point and FastAPI configuration for the Wallpaper Vault backend.
"""
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.api import api_router
from app.api.deps import verify_api_key
from app.core.tasks import cleanup_zombie_tasks
from app.core.logging import setup_logging
from app.core.config import settings
from app.core.demo_middleware import DemoSandboxMiddleware
from app.core.rate_limit import limiter
import structlog

logger = structlog.get_logger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info("Application starting up...")
    
    if settings.DEMO_MODE:
        logger.info("Demo sandbox mode is ACTIVE (read-only mode, slowapi rate limiting enabled)")

    if not settings.API_KEY and not settings.DEMO_MODE:
        logger.warning(
            "API authentication is disabled (API_KEY is unset/empty). "
            "Ensure this instance is protected if deployed on a network or NAS setup."
        )

    # Ensure all tables and migrations are updated in the database
    from app.db.session import engine, run_startup_migrations
    from app.models.base import Base
    import app.models  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(run_startup_migrations)
        await conn.run_sync(Base.metadata.create_all)

    await cleanup_zombie_tasks()
    
    # Clean up temporary imports folder
    import shutil
    temp_dir = Path(__file__).resolve().parent.parent / "temp_imports"
    if temp_dir.exists():
        try:
            shutil.rmtree(temp_dir)
            logger.info("Cleaned up temporary imports directory")
        except Exception as e:
            logger.error("Failed to clean up temporary imports directory", error=str(e))
    yield

app = FastAPI(lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(DemoSandboxMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api", dependencies=[Depends(verify_api_key)])

@app.get("/health", tags=["Health"])
@app.get("/api/health", tags=["Health"])
async def health() -> dict[str, str]:
    # Basic Healthcheck endpoint 
    return {"status": "ok", "message": "Wallpaper Vault API is running"}

static_dir = Path(__file__).resolve().parent.parent / "static"
if static_dir.exists():
    @app.get("/{path:path}", include_in_schema=False)
    async def spa_catch_all(path: str):
        file_path = static_dir / path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(static_dir / "index.html")
else:
    @app.get("/", tags=["Health"])
    async def root() -> dict[str, str]:
        # Basic Healthcheck endpoint when static frontend is not mounted
        return {"status": "ok", "message": "Wallpaper Vault API is running"}
