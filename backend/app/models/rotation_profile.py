"""
SQLAlchemy model definition for wallpaper rotation settings profiles.
Allows users to save and load named configuration profiles.
"""
from sqlalchemy import Column, Integer, String, text
from app.models.base import Base

class RotationProfile(Base):
    __tablename__ = "rotation_profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True, index=True)
    config_json = Column(String, nullable=False)
    created_at = Column(
        String, 
        server_default=text("(datetime('now'))")
    )
