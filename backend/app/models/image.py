from typing import Optional, TYPE_CHECKING
from sqlalchemy import text, ForeignKey
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.models.base import Base

if TYPE_CHECKING:
    from app.models.set import Set

class Image(Base):
    __tablename__ = "images"

    id: Mapped[int] = mapped_column(primary_key=True)
    set_id: Mapped[int] = mapped_column(ForeignKey("sets.id", ondelete="CASCADE"), nullable=False)
    filename: Mapped[str] = mapped_column(nullable=False)
    local_path: Mapped[str] = mapped_column(nullable=False)
    phash: Mapped[Optional[str]] = mapped_column()
    width: Mapped[Optional[int]] = mapped_column()
    height: Mapped[Optional[int]] = mapped_column()
    file_size: Mapped[Optional[int]] = mapped_column()
    aspect_ratio: Mapped[Optional[float]] = mapped_column()
    aspect_ratio_label: Mapped[Optional[str]] = mapped_column()
    sort_order: Mapped[Optional[int]] = mapped_column()
    notes: Mapped[Optional[str]] = mapped_column()
    date_added: Mapped[str] = mapped_column(server_default=text("(date('now'))"))

    set: Mapped["Set"] = relationship(back_populates="images")

    def __repr__(self) -> str:
        return f"<Image(id={self.id}, filename='{self.filename}')>"
