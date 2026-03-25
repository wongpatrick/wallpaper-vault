from fastapi import APIRouter
from app.api import creators

api_router = APIRouter()

api_router.include_router(creators.router, prefix="/creators", tags=["creators"])