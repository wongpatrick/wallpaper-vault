"""
SQLAlchemy model definition for library storage paths.
"""
from typing import Optional, TYPE_CHECKING
from sqlalchemy import text
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.models.base import Base

if TYPE_CHECKING:
    from app.models.set import Set

class LibraryPath(Base):
    __tablename__ = "library_paths"

    id: Mapped[int] = mapped_column(primary_key=True)
    path: Mapped[str] = mapped_column(unique=True, index=True)
    label: Mapped[Optional[str]] = mapped_column(nullable=True)
    is_default: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[Optional[str]] = mapped_column(server_default=text("(date('now'))"))

    sets: Mapped[list["Set"]] = relationship(
        back_populates="library_path"
    )

    def __repr__(self) -> str:
        return f"<LibraryPath(id={self.id}, path='{self.path}', label='{self.label}', is_default={self.is_default})>"
