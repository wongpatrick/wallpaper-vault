"""Character model definition."""
from typing import Optional
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey
from app.models.base import Base
from app.models.associations import set_characters, image_characters

class Character(Base):
    __tablename__ = "characters"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(nullable=False)
    franchise_id: Mapped[Optional[int]] = mapped_column(ForeignKey("franchises.id", ondelete="SET NULL"))

    franchise = relationship("Franchise", back_populates="characters", lazy="joined")
    
    sets = relationship(
        "Set",
        secondary=set_characters,
        back_populates="characters"
    )

    images = relationship(
        "Image",
        secondary=image_characters,
        back_populates="characters"
    )
