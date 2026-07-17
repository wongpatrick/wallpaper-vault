"""
API router initialization, combining all application module routers.
"""
from fastapi import APIRouter
from app.api import creators
from app.api import sets
from app.api import settings
from app.api import images
from app.api import dashboard
from app.api import audit
from app.api import tags
from app.api import thumbnails
from app.api import characters
from app.api import franchises
from app.api import playlists
from app.api import search
from app.api import rotation_history
from app.api import rotation_profiles
from app.api import rotation_rules

api_router = APIRouter()

api_router.include_router(creators.router, prefix="/creators", tags=["creators"])
api_router.include_router(sets.router, prefix="/sets", tags=["sets"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])
api_router.include_router(images.router, prefix="/images", tags=["images"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(audit.router, prefix="/audit", tags=["audit"])
api_router.include_router(tags.router, prefix="/tags", tags=["tags"])
api_router.include_router(thumbnails.router, prefix="/images", tags=["thumbnails"])
api_router.include_router(characters.router, prefix="/characters", tags=["characters"])
api_router.include_router(franchises.router, prefix="/franchises", tags=["franchises"])
api_router.include_router(playlists.router, prefix="/playlists", tags=["playlists"])
api_router.include_router(search.router, prefix="/search", tags=["search"])
api_router.include_router(rotation_history.router, prefix="/rotation-history", tags=["rotation-history"])
api_router.include_router(rotation_profiles.router, prefix="/rotation-profiles", tags=["rotation-profiles"])
api_router.include_router(rotation_rules.router, prefix="/rotation-rules", tags=["rotation-rules"])