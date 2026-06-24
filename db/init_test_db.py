import asyncio
import os
import sys
from sqlalchemy.ext.asyncio import create_async_engine

# Add backend directory to sys.path so we can import app modules
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.models.base import Base
import app.models  # Ensures all models are registered on Base

async def init_test_db():
    db_path = os.path.join(os.path.dirname(__file__), "test_e2e.db")
    # Clean up old test database file if it exists
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError:
            # If database is locked, it will raise an error.
            # In Windows, if process holds lock, we fail to remove it.
            pass
        
    db_url = f"sqlite+aiosqlite:///{db_path.replace('\\', '/')}"
    print(f"Initializing test database at: {db_url}")
    
    engine = create_async_engine(db_url, echo=False, future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    # Seed default settings for testing
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.models.settings import Setting
    
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        library_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "tests", "e2e", "temp_import_dir", "library"))
        library_path_normalized = library_path.replace('\\', '/')
        
        # Upsert base_library_path setting
        from sqlalchemy import select
        res = await session.execute(select(Setting).where(Setting.key == "base_library_path"))
        existing = res.scalar_one_or_none()
        if existing:
            existing.value = library_path_normalized
        else:
            setting = Setting(
                key="base_library_path",
                value=library_path_normalized,
                description="Base library path for E2E testing"
            )
            session.add(setting)
        await session.commit()

    await engine.dispose()
    print("Database schema initialized and settings seeded successfully.")

if __name__ == "__main__":
    asyncio.run(init_test_db())
