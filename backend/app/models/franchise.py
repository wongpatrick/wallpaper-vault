"""Franchise model definition."""
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base

class Franchise(Base):
    __tablename__ = "franchises"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True, nullable=False)

    characters = relationship("Character", back_populates="franchise")
