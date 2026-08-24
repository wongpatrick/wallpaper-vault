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
        ("sets", "CREATE INDEX IF NOT EXISTS ix_sets_library_path_id ON sets(library_path_id)"),
    ]:
        res = connection.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
        if res:
            try:
                connection.execute(text(index_sql))
            except Exception:
                pass

    # Ensure library_paths table exists
    connection.execute(text("""
        CREATE TABLE IF NOT EXISTS library_paths (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path VARCHAR UNIQUE NOT NULL,
            label VARCHAR,
            is_default BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT (date('now'))
        )
    """))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_library_paths_path ON library_paths(path)"))

    # Ensure library_path_id column exists on sets table if sets table exists
    res_sets = connection.execute(text("PRAGMA table_info(sets)")).fetchall()
    if res_sets:
        set_cols = [row[1] for row in res_sets]
        if "library_path_id" not in set_cols:
            connection.execute(text("ALTER TABLE sets ADD COLUMN library_path_id INTEGER REFERENCES library_paths(id) ON DELETE SET NULL"))

    # Backfill migration from base_library_path setting if library_paths table is empty
    res_lp = connection.execute(text("PRAGMA table_info(library_paths)")).fetchall()
    res_settings = connection.execute(text("PRAGMA table_info(settings)")).fetchall()
    if res_lp and res_sets and res_settings:
        try:
            lp_count = connection.execute(text("SELECT COUNT(*) FROM library_paths")).scalar()
            if lp_count == 0:
                res_setting = connection.execute(text("SELECT value FROM settings WHERE key = 'base_library_path'")).fetchone()
                if res_setting and res_setting[0] and res_setting[0].strip():
                    base_path_val = res_setting[0].strip()
                    connection.execute(
                        text("INSERT INTO library_paths (path, label, is_default) VALUES (:path, :label, 1)"),
                        {"path": base_path_val, "label": "Default Library"}
                    )
                    inserted_id = connection.execute(text("SELECT id FROM library_paths WHERE path = :path"), {"path": base_path_val}).scalar()
                    if inserted_id:
                        connection.execute(
                            text("UPDATE sets SET library_path_id = :lid WHERE library_path_id IS NULL"),
                            {"lid": inserted_id}
                        )
        except Exception:
            pass

    # Ensure vault_id and vault_name exist in settings
    if res_settings:
        import uuid
        import socket
        try:
            vault_id_row = connection.execute(text("SELECT value FROM settings WHERE key = 'vault_id'")).fetchone()
            if not vault_id_row:
                connection.execute(
                    text("INSERT INTO settings (key, value, description) VALUES (:key, :value, :description)"),
                    {"key": "vault_id", "value": str(uuid.uuid4()), "description": "Unique identifier for this vault instance"}
                )
            vault_name_row = connection.execute(text("SELECT value FROM settings WHERE key = 'vault_name'")).fetchone()
            if not vault_name_row:
                hostname = socket.gethostname() or "Local Vault"
                connection.execute(
                    text("INSERT INTO settings (key, value, description) VALUES (:key, :value, :description)"),
                    {"key": "vault_name", "value": hostname, "description": "Display name for this vault instance"}
                )
        except Exception:
            pass