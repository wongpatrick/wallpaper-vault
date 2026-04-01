from fastapi import APIRouter
from app.api import creators
from app.api import sets
from app.api import settings

api_router = APIRouter()

api_router.include_router(creators.router, prefix="/creators", tags=["creators"])
api_router.include_router(sets.router, prefix="/sets", tags=["sets"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])