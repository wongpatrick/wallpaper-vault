from sqlalchemy import Column, ForeignKey, String, Table
from app.models.base import Base

set_creators = Table(
    "set_creators",
    Base.metadata,
    Column("set_id", ForeignKey("sets.id"), primary_key=True),
    Column("creator_id", ForeignKey("creators.id"), primary_key=True),
    Column("role", String)
)