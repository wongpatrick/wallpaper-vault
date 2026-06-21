"""
SQLAlchemy model definition for Playlists and their association with Images.
"""
from typing import Optional, TYPE_CHECKING
from sqlalchemy import text, ForeignKey
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.models.base import Base

if TYPE_CHECKING:
    from app.models.image import Image

class PlaylistImage(Base):
    __tablename__ = "playlist_images"

    playlist_id: Mapped[int] = mapped_column(ForeignKey("playlists.id", ondelete="CASCADE"), primary_key=True)
    image_id: Mapped[int] = mapped_column(ForeignKey("images.id", ondelete="CASCADE"), primary_key=True)
    sort_order: Mapped[int] = mapped_column(server_default=text("0"), default=0)

    # Relationships
    playlist: Mapped["Playlist"] = relationship(back_populates="playlist_images")
    image: Mapped["Image"] = relationship(back_populates="playlist_images")


class Playlist(Base):
    __tablename__ = "playlists"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column()
    date_created: Mapped[str] = mapped_column(server_default=text("(date('now'))"))

    # Relationship to association table
    playlist_images: Mapped[list["PlaylistImage"]] = relationship(
        back_populates="playlist",
        cascade="all, delete-orphan",
        order_by="PlaylistImage.sort_order"
    )

    def __repr__(self) -> str:
        return f"<Playlist(id={self.id}, name='{self.name}')>"
