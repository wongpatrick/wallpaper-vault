"""
Many-to-many association tables for SQLAlchemy models.
"""
from sqlalchemy import Column, ForeignKey, String, Table
from app.models.base import Base

set_creators = Table(
    "set_creators",
    Base.metadata,
    Column("set_id", ForeignKey("sets.id"), primary_key=True),
    Column("creator_id", ForeignKey("creators.id"), primary_key=True),
    Column("role", String)
)

set_tags = Table(
    "set_tags",
    Base.metadata,
    Column("set_id", ForeignKey("sets.id"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id"), primary_key=True)
)

set_characters = Table(
    "set_characters",
    Base.metadata,
    Column("set_id", ForeignKey("sets.id"), primary_key=True),
    Column("character_id", ForeignKey("characters.id"), primary_key=True)
)