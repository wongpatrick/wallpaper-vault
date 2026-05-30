"""
Main application entry point and FastAPI configuration for the Wallpaper Vault backend.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import api_router
from app.core.tasks import cleanup_zombie_tasks
from app.core.logging import setup_logging
import structlog

logger = structlog.get_logger(__name__)

app = FastAPI()

@app.on_event("startup")
async def startup_event() -> None:
    setup_logging()
    logger.info("Application starting up...")
    await cleanup_zombie_tasks()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")

@app.get("/", tags=["Health"])
async def root() -> dict[str, str]:
    # Basic Healthcheck endpoint 
    return {"status": "ok", "message": "Wallpaper Vault API is running"}
