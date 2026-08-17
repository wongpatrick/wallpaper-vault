"""
Script to initialize and seed a demo database with sample data for hosted demo deployments.
"""
import argparse
import asyncio
from pathlib import Path
import shutil
import sys

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

# Add the backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

from app.models.base import Base  # noqa: E402
from app.models import (  # noqa: E402, F401
    AuditIssue,
    Character,
    Creator,
    Franchise,
    Image,
    Playlist,
    PlaylistImage,
    Set,
    Setting,
    Tag,
    Task,
)
from app.core.enums import ImageRating  # noqa: E402


async def seed_demo_data(
    db_path: str | Path = "./db/wallpapers.db",
    library_path: str | Path = "./library",
    assets_dir: str | Path | None = None,
):
    """Seed the database with curated demo entities, sample sets, and optional images."""
    target_db_path = Path(db_path).resolve()
    target_db_path.parent.mkdir(parents=True, exist_ok=True)
    target_library_path = Path(library_path).resolve()
    target_library_path.mkdir(parents=True, exist_ok=True)

    target_url = f"sqlite+aiosqlite:///{target_db_path.as_posix()}"
    engine = create_async_engine(
        target_url,
        echo=False,
        future=True,
        poolclass=NullPool,
        connect_args={"check_same_thread": False, "timeout": 30},
    )

    print(f"Creating database schema at {target_db_path}...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        print("Seeding base settings...")
        base_lib_setting = Setting(key="base_library_path", value=str(target_library_path))
        session.add(base_lib_setting)

        print("Seeding demo creators...")
        ghibli = Creator(canonical_name="Studio Ghibli", type="Studio", notes="Legendary animation studio.")
        shinkai = Creator(canonical_name="Makoto Shinkai", type="Director", notes="Renowned film director and animator.")
        cyber_artist = Creator(canonical_name="Aesthetic Visions", type="Artist", notes="Digital scenic & cyberpunk illustration.")
        session.add_all([ghibli, shinkai, cyber_artist])
        await session.flush()

        print("Seeding demo franchises...")
        anime_classics = Franchise(name="Anime Classics")
        scifi_world = Franchise(name="Cyber Scapes")
        session.add_all([anime_classics, scifi_world])
        await session.flush()

        print("Seeding demo characters...")
        chihiro = Character(name="Chihiro Ogino", franchise_id=anime_classics.id)
        taki = Character(name="Taki Tachibana", franchise_id=anime_classics.id)
        mitsuha = Character(name="Mitsuha Miyamizu", franchise_id=anime_classics.id)
        session.add_all([chihiro, taki, mitsuha])
        await session.flush()

        print("Seeding demo tags...")
        tag_names = ["landscape", "scenery", "night", "city", "fantasy", "4k", "neon", "sunset", "clouds", "nature"]
        tags_dict = {}
        for name in tag_names:
            t = Tag(name=name)
            session.add(t)
            tags_dict[name] = t
        await session.flush()

        print("Seeding demo sets...")
        set_ghibli_path = target_library_path / "Studio Ghibli - Spirited Horizons"
        set_ghibli_path.mkdir(parents=True, exist_ok=True)
        set_ghibli = Set(
            title="Spirited Horizons",
            local_path=str(set_ghibli_path),
            creators=[ghibli],
            tags=[tags_dict["landscape"], tags_dict["fantasy"], tags_dict["nature"]],
        )

        set_shinkai_path = target_library_path / "Makoto Shinkai - Twilight Skies"
        set_shinkai_path.mkdir(parents=True, exist_ok=True)
        set_shinkai = Set(
            title="Twilight Skies",
            local_path=str(set_shinkai_path),
            creators=[shinkai],
            tags=[tags_dict["scenery"], tags_dict["sunset"], tags_dict["clouds"]],
        )

        set_cyber_path = target_library_path / "Aesthetic Visions - Neon Metropolis"
        set_cyber_path.mkdir(parents=True, exist_ok=True)
        set_cyber = Set(
            title="Neon Metropolis",
            local_path=str(set_cyber_path),
            creators=[cyber_artist],
            tags=[tags_dict["night"], tags_dict["city"], tags_dict["neon"], tags_dict["4k"]],
        )
        session.add_all([set_ghibli, set_shinkai, set_cyber])
        await session.flush()

        print("Seeding demo playlist...")
        demo_playlist = Playlist(
            name="Featured Demo Wallpapers",
            description="A curated selection of sample wallpapers for the live web demo.",
        )
        session.add(demo_playlist)
        await session.flush()

        # If sample assets directory is provided, copy images and register them
        if assets_dir and Path(assets_dir).exists():
            print(f"Scanning sample images from {assets_dir}...")
            source_assets = list(Path(assets_dir).glob("*.*"))
            for idx, asset_file in enumerate(source_assets):
                if asset_file.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
                    continue
                target_set = [set_ghibli, set_shinkai, set_cyber][idx % 3]
                dest_file = Path(target_set.local_path) / asset_file.name
                shutil.copy2(asset_file, dest_file)

                img = Image(
                    set_id=target_set.id,
                    filename=asset_file.name,
                    local_path=str(dest_file),
                    width=3840,
                    height=2160,
                    file_size=dest_file.stat().st_size,
                    aspect_ratio=3840 / 2160,
                    aspect_ratio_label="16x9",
                    rating=ImageRating.GENERAL,
                )
                session.add(img)

        await session.commit()
        print("Demo database seeding complete!")

    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed demo SQLite database for hosted deployment.")
    parser.add_argument("--db-path", default="./db/wallpapers.db", help="Path to destination SQLite database file")
    parser.add_argument("--library-path", default="./library", help="Path to destination wallpaper library directory")
    parser.add_argument("--assets-dir", default=None, help="Optional directory containing sample image files to import")
    args = parser.parse_args()

    asyncio.run(seed_demo_data(db_path=args.db_path, library_path=args.library_path, assets_dir=args.assets_dir))
