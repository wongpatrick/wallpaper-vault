from sqlalchemy import Column, String, DateTime, text
from app.models.base import Base

class Setting(Base):
    __tablename__ = "settings"

    key = Column(String, primary_key=True, index=True)
    value = Column(String, nullable=False)
    description = Column(String, nullable=True)
    updated_at = Column(
        DateTime, 
        server_default=text("(datetime('now'))"), 
        onupdate=text("(datetime('now'))")
    )
