"""
SQLAlchemy model definition for normalized tags.
"""
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base
from app.models.associations import set_tags, image_tags

class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True, nullable=False)

    sets = relationship(
        "Set",
        secondary=set_tags,
        back_populates="tags"
    )

    images = relationship(
        "Image",
        secondary=image_tags,
        back_populates="tags"
    )
