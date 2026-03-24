from typing import Optional, TYPE_CHECKING
from sqlalchemy import Mapped, mapped_column
from sqlalchemy.orm import relationship
from app.models.base import Base
from app.models.associations import set_creators

if TYPE_CHECKING:
    from app.models.set import Set

class Creator(Base):
    __tablename__ = "creators"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    canonical_name: Mapped[str] = mapped_column(nullable=False)
    type: Mapped[Optional[str]] = mapped_column()
    notes: Mapped[Optional[str]] = mapped_column()

    sets: Mapped[list["Set"]] = relationship(
        secondary=set_creators, 
        back_populates="creator"
        )

    def __repr__(self) -> str:
        return f"<Creator(id={self.id}, name='{self.canonical_name}')>"