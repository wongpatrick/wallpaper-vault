"""
SQLAlchemy model definition for wallpaper rotation rules.
Allows users to override rotation settings based on date/time conditions.
"""
from typing import Optional, TYPE_CHECKING
from sqlalchemy import text, ForeignKey
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.models.base import Base

if TYPE_CHECKING:
    from app.models.playlist import Playlist

class RotationRule(Base):
    __tablename__ = "rotation_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(nullable=False)
    priority: Mapped[int] = mapped_column(server_default=text("0"), default=0)
    enabled: Mapped[int] = mapped_column(server_default=text("1"), default=1)
    
    # Conditions
    start_date: Mapped[Optional[str]] = mapped_column(nullable=True)   # MM-DD
    end_date: Mapped[Optional[str]] = mapped_column(nullable=True)     # MM-DD
    days_of_week: Mapped[Optional[str]] = mapped_column(nullable=True) # Comma separated, e.g. "1,2,3,4,5"
    start_time: Mapped[Optional[str]] = mapped_column(nullable=True)   # HH:MM
    end_time: Mapped[Optional[str]] = mapped_column(nullable=True)     # HH:MM
    
    # Overrides
    source: Mapped[str] = mapped_column(nullable=False) # "entire_library" or "playlist"
    playlist_id: Mapped[Optional[int]] = mapped_column(ForeignKey("playlists.id", ondelete="SET NULL"), nullable=True)
    style: Mapped[Optional[str]] = mapped_column(nullable=True)        # "fill", "fit", "stretch", "center", "span"

    # Relationships
    playlist: Mapped[Optional["Playlist"]] = relationship()

    def __repr__(self) -> str:
        return f"<RotationRule(id={self.id}, name='{self.name}', priority={self.priority}, enabled={self.enabled})>"
