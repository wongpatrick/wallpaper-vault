import pytest
from sqlalchemy import text, create_engine
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import run_startup_migrations
from app.models.base import Base

EXPECTED_INDICES = {
    "images": [
        "ix_images_set_id",
        "ix_images_is_blacklisted",
        "ix_images_created_at",
        "ix_images_aspect_ratio_label",
        "ix_images_is_favorite",
        "ix_images_rating",
        "ix_images_dominant_color_bucket",
    ],
    "sets": [
        "ix_sets_created_at",
        "ix_sets_library_path_id",
    ],
    "rotation_history": [
        "ix_rotation_history_timestamp",
        "ix_rotation_history_image_id",
        "ix_rotation_history_vault_id",
    ],
    "rotation_rules": [
        "ix_rotation_rules_enabled",
        "ix_rotation_rules_playlist_id",
        "idx_rotation_rules_enabled_priority",
    ],
    "characters": [
        "ix_characters_franchise_id",
        "idx_unique_character_franchise",
        "idx_unique_character_no_franchise",
    ],
    "set_creators": [
        "ix_set_creators_creator_id",
    ],
    "set_tags": [
        "ix_set_tags_tag_id",
    ],
    "set_characters": [
        "ix_set_characters_character_id",
    ],
    "image_tags": [
        "ix_image_tags_tag_id",
    ],
    "image_characters": [
        "ix_image_characters_character_id",
    ],
    "audit_issues": [
        "idx_audit_issues_type_status",
        "ix_audit_issues_image_id",
        "ix_audit_issues_set_id",
        "ix_audit_issues_task_id",
        "ix_audit_issues_directory",
    ],
    "cross_vault_playlist_images": [
        "idx_cvpi_playlist_id",
        "idx_cvpi_vault_id",
    ],
}


@pytest.mark.asyncio
async def test_database_indices_created_and_used(db_session: AsyncSession):
    """
    Verify that all required indices exist and are functional on tables in async session.
    """
    conn = await db_session.connection()
    await conn.run_sync(run_startup_migrations)

    for table_name, indices in EXPECTED_INDICES.items():
        result = await db_session.execute(text(f"PRAGMA index_list({table_name})"))
        existing = {row[1] for row in result.fetchall()}
        for idx in indices:
            assert idx in existing, f"Missing index {idx} on table {table_name}. Found: {existing}"


def test_startup_migrations_on_sync_engine(tmp_path):
    """
    Test startup migrations on a fresh standalone SQLite database using sync engine.
    """
    db_file = tmp_path / "migration_test.db"
    sync_engine = create_engine(f"sqlite:///{db_file}")

    with sync_engine.connect() as conn:
        Base.metadata.create_all(conn)
        run_startup_migrations(conn)
        conn.commit()

        for table_name, indices in EXPECTED_INDICES.items():
            result = conn.execute(text(f"PRAGMA index_list({table_name})"))
            existing = {row[1] for row in result.fetchall()}
            for idx in indices:
                assert idx in existing, f"Missing index {idx} on table {table_name}. Found: {existing}"
