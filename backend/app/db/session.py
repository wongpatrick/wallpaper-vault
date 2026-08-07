"""
Database session management and asynchronous SQLAlchemy engine setup.
"""
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool
from sqlalchemy import event
from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    poolclass=NullPool,
    connect_args={"check_same_thread": False, "timeout": 30},
)

@event.listens_for(engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()

SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session

def run_startup_migrations(connection):
    from sqlalchemy import text
    # Column renames
    for table_name, old_col, new_col in [
        ("images", "date_added", "created_at"),
        ("sets", "date_added", "created_at"),
        ("playlists", "date_created", "created_at"),
    ]:
        res = connection.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
        columns = [row[1] for row in res]
        if old_col in columns and new_col not in columns:
            connection.execute(text(f"ALTER TABLE {table_name} RENAME COLUMN {old_col} TO {new_col}"))

    for table_name, index_sql in [
        ("playlist_images", "CREATE INDEX IF NOT EXISTS idx_playlist_images_image_id ON playlist_images(image_id)"),
        ("images", "CREATE INDEX IF NOT EXISTS ix_images_is_favorite ON images(is_favorite)"),
        ("images", "CREATE INDEX IF NOT EXISTS ix_images_rating ON images(rating)"),
        ("rotation_rules", "CREATE INDEX IF NOT EXISTS ix_rotation_rules_enabled ON rotation_rules(enabled)"),
        ("characters", "CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_character_franchise ON characters(lower(name), franchise_id) WHERE franchise_id IS NOT NULL"),
        ("characters", "CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_character_no_franchise ON characters(lower(name)) WHERE franchise_id IS NULL"),
    ]:
        res = connection.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
        if res:
            try:
                connection.execute(text(index_sql))
            except Exception:
                pass