"""
Database queries for dashboard statistics and system health alerts.
"""
import os
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.config import settings
from app.models.image import Image
from app.models.set import Set
from app.models.creator import Creator
from app.schemas.dashboard import LibraryStats, HealthAlert, DashboardData

def get_db_file_size() -> int:
    """Calculates the database file size on disk in bytes."""
    url = settings.DATABASE_URL
    for prefix in ["sqlite+aiosqlite:///", "sqlite:///"]:
        if url.startswith(prefix):
            db_path = url[len(prefix):]
            abs_path = os.path.abspath(db_path)
            if os.path.exists(abs_path):
                return os.path.getsize(abs_path)
    return 0

async def get_library_stats(db: AsyncSession) -> LibraryStats:
    """Aggregates overarching statistics for the entire library.

    Calculates totals for images, sets, creators, disk usage, and aspect ratio distribution.

    Args:
        db: Database session.

    Returns:
        A LibraryStats object containing the aggregated metrics.
    """
    # 1. Total counts and size in a single aggregated round trip
    stats_query = select(
        select(func.count(Image.id)).scalar_subquery().label("total_images"),
        select(func.coalesce(func.sum(Image.file_size), 0)).scalar_subquery().label("total_size_bytes"),
        select(func.count(Set.id)).scalar_subquery().label("total_sets"),
        select(func.count(Creator.id)).scalar_subquery().label("total_creators"),
    )

    # 2. Aspect Ratio distribution
    ar_query = select(
        Image.aspect_ratio_label,
        func.count(Image.id)
    ).group_by(Image.aspect_ratio_label)

    # Execute queries
    stats_result = await db.execute(stats_query)
    stats_data = stats_result.one()

    ar_result = await db.execute(ar_query)
    ar_dist = {}
    for row in ar_result.all():
        label = row[0] or "Unknown"
        ar_dist[label] = ar_dist.get(label, 0) + row[1]

    return LibraryStats(
        total_images=stats_data.total_images or 0,
        total_sets=stats_data.total_sets or 0,
        total_creators=stats_data.total_creators or 0,
        total_size_bytes=int(stats_data.total_size_bytes or 0),
        database_size_bytes=get_db_file_size(),
        aspect_ratio_distribution=ar_dist
    )

async def get_health_alerts(db: AsyncSession) -> list[HealthAlert]:
    """Generates health alerts for the system based on data integrity and quality.

    Checks for issues like 'Unknown' artists, missing perceptual hashes, and untagged sets.

    Args:
        db: Database session.

    Returns:
        A list of HealthAlert objects detailing potential system issues.
    """
    # Combine alert counts into a single SQL query
    alerts_query = select(
        select(func.count(Set.id)).join(Set.creators).filter(Creator.canonical_name == "Unknown").scalar_subquery().label("unknown_count"),
        select(func.count(Image.id)).filter(Image.phash.is_(None)).scalar_subquery().label("phash_count"),
        select(func.count(Set.id)).filter(~Set.tags.any()).scalar_subquery().label("tags_count"),
    )
    res = await db.execute(alerts_query)
    row = res.one()

    alerts = []
    unknown_count = row.unknown_count or 0
    if unknown_count > 0:
        alerts.append(HealthAlert(
            id="unknown_artist",
            severity="warning",
            message="Sets assigned to 'Unknown' artist",
            count=unknown_count,
            link="/creators?search=Unknown"
        ))
        
    phash_count = row.phash_count or 0
    if phash_count > 0:
        alerts.append(HealthAlert(
            id="missing_phash",
            severity="warning",
            message="Images missing perceptual hash",
            count=phash_count,
            link="/tools"
        ))

    tags_count = row.tags_count or 0
    if tags_count > 0:
        alerts.append(HealthAlert(
            id="missing_tags",
            severity="optimization",
            message="Sets with no tags assigned",
            count=tags_count,
            link="/sets?filter=untagged"
        ))

    return alerts

async def get_dashboard_data(db: AsyncSession) -> DashboardData:
    """Combines library stats and health alerts into a unified dashboard response.

    Args:
        db: Database session.

    Returns:
        A DashboardData object containing both stats and health alerts.
    """
    stats = await get_library_stats(db)
    alerts = await get_health_alerts(db)
    return DashboardData(
        stats=stats,
        health_alerts=alerts
    )
