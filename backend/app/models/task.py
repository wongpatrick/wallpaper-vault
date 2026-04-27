from sqlalchemy import Column, Integer, String, DateTime, Float
from datetime import datetime
from app.models.base import Base

class Task(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True, index=True)
    status = Column(String, default="accepted") # accepted, processing, completed, error
    progress = Column(Integer, default=0)
    total = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    error_message = Column(String, nullable=True)
