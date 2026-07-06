"""
SQLAlchemy model definition for wallpaper rotation history.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.models.base import Base

class RotationHistory(Base):
    __tablename__ = "rotation_history"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, server_default=func.now(), nullable=False)
    image_id = Column(Integer, ForeignKey("images.id", ondelete="CASCADE"), nullable=False)
    aspect_ratio = Column(String, nullable=True)

    # Relationships
    image = relationship("Image")

    def __repr__(self) -> str:
        return f"<RotationHistory(id={self.id}, image_id={self.image_id}, timestamp='{self.timestamp}')>"
