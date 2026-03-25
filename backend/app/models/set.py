from typing import Optional, TYPE_CHECKING
from sqlalchemy import text
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.models.base import Base
from app.models.associations import set_creators

if TYPE_CHECKING:
    from app.models.creator import Creator

class Set(Base):
    __tablename__ = "sets"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[Optional[str]] = mapped_column()
    source_url: Mapped[Optional[str]] = mapped_column(unique=True)
    local_path: Mapped[Optional[str]] = mapped_column()
    phash:      Mapped[Optional[str]] = mapped_column()
    notes:      Mapped[Optional[str]] = mapped_column()
    date_added: Mapped[Optional[str]] = mapped_column(server_default=text("(date('now'))"))

    creators: Mapped[list["Creator"]] = relationship(
        secondary=set_creators,
        back_populates="sets"
    )

    def __repr__(self) -> str:
        return f"<Set(id={self.id}, title='{self.title}')>"