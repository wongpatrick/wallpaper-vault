import argparse
import os
import sqlite3
from pathlib import Path

def get_db_path(custom_path: str | Path | None = None) -> Path:
    if custom_path:
        return Path(custom_path)
    env_db = os.environ.get("DATABASE_URL")
    if env_db:
        clean_url = env_db.replace("sqlite+aiosqlite:///", "").replace("sqlite:///", "")
        return Path(clean_url)
    return Path(__file__).resolve().parent.parent / "db" / "wallpapers.db"

def main():
    parser = argparse.ArgumentParser(description="Run schema migration on database.")
    parser.add_argument("--db-path", help="Path to SQLite database file")
    args = parser.parse_args()

    db_path = get_db_path(args.db_path)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 1. Drop the columns
    try:
        cursor.execute("ALTER TABLE sets DROP COLUMN tags;")
        print("Dropped tags column from sets.")
    except sqlite3.OperationalError as e:
        print(f"Skipping dropping sets.tags: {e}")

    try:
        cursor.execute("ALTER TABLE images DROP COLUMN tags;")
        print("Dropped tags column from images.")
    except sqlite3.OperationalError as e:
        print(f"Skipping dropping images.tags: {e}")

    # 2. Add COLLATE NOCASE to tags table
    print("Recreating tags table with COLLATE NOCASE...")
    cursor.executescript("""
        PRAGMA foreign_keys = OFF;
        
        CREATE TABLE tags_new (
            id   INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE
        );
        
        INSERT INTO tags_new (id, name) SELECT id, name FROM tags;
        
        DROP TABLE tags;
        ALTER TABLE tags_new RENAME TO tags;
        
        PRAGMA foreign_keys = ON;
    """)
    
    conn.commit()
    conn.close()
    print("Schema migration complete!")

if __name__ == "__main__":
    main()
