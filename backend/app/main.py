"""
Main application entry point and FastAPI configuration for the Wallpaper Vault backend.
"""
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.api import api_router
from app.api.deps import verify_api_key
from app.core.tasks import cleanup_zombie_tasks
from app.core.logging import setup_logging
import structlog

logger = structlog.get_logger(__name__)

app = FastAPI()

@app.on_event("startup")
async def startup_event() -> None:
    setup_logging()
    logger.info("Application starting up...")
    
    # Ensure all tables are created in the database
    from app.db.session import engine
    from app.models.base import Base
    import app.models  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    await cleanup_zombie_tasks()
    
    # Clean up temporary imports folder
    import shutil
    from pathlib import Path
    temp_dir = Path("../backend/temp_imports")
    if temp_dir.exists():
        try:
            shutil.rmtree(temp_dir)
            logger.info("Cleaned up temporary imports directory")
        except Exception as e:
            logger.error("Failed to clean up temporary imports directory", error=str(e))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api", dependencies=[Depends(verify_api_key)])

@app.get("/", tags=["Health"])
async def root() -> dict[str, str]:
    # Basic Healthcheck endpoint 
    return {"status": "ok", "message": "Wallpaper Vault API is running"}
