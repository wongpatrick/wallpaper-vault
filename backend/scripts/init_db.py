"""
Script to initialize the application database.
Creates all required tables if they do not already exist.
"""
import argparse
import asyncio
import sys
from pathlib import Path

# Add the backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

from app.db.session import engine as default_engine
from app.models.base import Base
# Import all models to ensure they are registered with Base
from app.models import Creator, Set, Image, Setting, Task, AuditIssue, Tag, Character, Franchise, Playlist, PlaylistImage
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

async def init_db(db_path: str | Path | None = None):
    print("Initializing database tables...")
    if db_path:
        target_path = Path(db_path).resolve()
        target_url = f"sqlite+aiosqlite:///{target_path.as_posix()}"
        target_engine = create_async_engine(
            target_url,
            echo=False,
            future=True,
            poolclass=NullPool,
            connect_args={"check_same_thread": False, "timeout": 30},
        )
    else:
        target_engine = default_engine

    async with target_engine.begin() as conn:
        # This will create all tables defined in models that don't exist yet
        await conn.run_sync(Base.metadata.create_all)

    if db_path:
        await target_engine.dispose()

    print("Database initialization complete.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Initialize database schema.")
    parser.add_argument("--db-path", help="Path to SQLite database file to initialize")
    args = parser.parse_args()
    asyncio.run(init_db(args.db_path))
