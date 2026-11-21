"""
Service for detecting and grouping exact and near-duplicate images.
Uses multi-index perceptual hash bucketing (Pigeonhole Principle) for high-speed
pairwise Hamming distance evaluation without O(N^2) event loop blocking.
"""

from collections import defaultdict
from typing import Any, Optional
import anyio
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.mappers import map_image_to_context_schema
from app.core.image_analysis import hamming_similarity_percent
from app.models.image import Image
from app.models.set import Set
from app.schemas.image import DuplicateGroup, ImageWithContext

logger = structlog.get_logger(__name__)

# Max bucket size for candidate pairing to avoid quadratic blowup on degenerate blank hashes
MAX_BUCKET_CANDIDATES = 250
# Overlapping 16-bit block shifts across 64-bit perceptual hashes
BLOCK_SHIFTS_16BIT = (0, 8, 16, 24, 32, 40, 48)
# Minimum group size to be considered duplicates
MIN_DUPLICATE_GROUP_SIZE = 2


def _score_image_quality(img: ImageWithContext) -> float:
    """
    Score image to recommend the best version to retain.
    Prefers organized creators, then higher resolution (megapixels), then file size.
    """
    score = 0.0
    if img.creator_names and "Needs Organizing" not in " ".join(img.creator_names):
        score += 1000.0

    w = img.width or 0
    h = img.height or 0
    score += (w * h) / 1_000_000.0

    if img.file_size:
        score += (img.file_size / (1024 * 1024)) * 0.01

    return score


def find_duplicate_pairs_sync(
    items: list[tuple[int, int, str]], max_distance: int = 0
) -> list[tuple[int, int, int]]:
    """
    Find pairs of image IDs within max_distance bit differences.
    Runs synchronously in worker thread to prevent event loop stalls.

    Args:
        items: List of (image_id, int_hash, phash_hex)
        max_distance: Max Hamming distance (0 = exact match only, 1-8 = near duplicates)

    Returns:
        List of (id_a, id_b, distance)
    """
    if len(items) < MIN_DUPLICATE_GROUP_SIZE:
        return []

    # Exact match fast path (O(N) dictionary grouping)
    if max_distance <= 0:
        hash_to_ids: dict[int, list[int]] = defaultdict(list)
        for rid, h_int, _ in items:
            hash_to_ids[h_int].append(rid)

        exact_pairs: list[tuple[int, int, int]] = []
        for id_list in hash_to_ids.values():
            if len(id_list) > 1:
                for i in range(len(id_list)):
                    for j in range(i + 1, len(id_list)):
                        exact_pairs.append((id_list[i], id_list[j], 0))
        return exact_pairs

    # Multi-index sub-hash bucketing for near duplicates
    buckets: list[dict[int, list[int]]] = [defaultdict(list) for _ in BLOCK_SHIFTS_16BIT]

    for idx, (_, h_int, _) in enumerate(items):
        for b_idx, shift in enumerate(BLOCK_SHIFTS_16BIT):
            chunk = (h_int >> shift) & 0xFFFF
            buckets[b_idx][chunk].append(idx)

    seen_pairs: set[tuple[int, int]] = set()
    matches: list[tuple[int, int, int]] = []

    for bucket_dict in buckets:
        for id_indices in bucket_dict.values():
            if 1 < len(id_indices) <= MAX_BUCKET_CANDIDATES:
                n = len(id_indices)
                for i in range(n):
                    idx_a = id_indices[i]
                    for j in range(i + 1, n):
                        idx_b = id_indices[j]
                        p = (idx_a, idx_b) if idx_a < idx_b else (idx_b, idx_a)
                        if p not in seen_pairs:
                            seen_pairs.add(p)
                            dist = (items[p[0]][1] ^ items[p[1]][1]).bit_count()
                            if dist <= max_distance:
                                matches.append((items[p[0]][0], items[p[1]][0], dist))

    return matches


def cluster_duplicate_pairs(
    matches: list[tuple[int, int, int]],
    id_to_phash: dict[int, str],
    max_distance: int,
) -> list[dict[str, Any]]:
    """
    Group matched pairs into cohesive duplicate clusters, preventing concept drift.

    Args:
        matches: List of (id_a, id_b, distance)
        id_to_phash: Mapping of image ID to hex phash string
        max_distance: Maximum allowable distance

    Returns:
        List of cluster dictionaries with member IDs, max distance, and centroid
    """
    if not matches:
        return []

    # Build adjacency
    adj: dict[int, dict[int, int]] = defaultdict(dict)
    for u, v, d in matches:
        adj[u][v] = d
        adj[v][u] = d

    visited: set[int] = set()
    clusters: list[dict[str, Any]] = []

    for node in sorted(adj.keys()):
        if node in visited:
            continue

        # Extract connected component via BFS
        component: list[int] = []
        queue = [node]
        visited.add(node)

        while queue:
            curr = queue.pop(0)
            component.append(curr)
            for neighbor in adj[curr]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)

        if len(component) < MIN_DUPLICATE_GROUP_SIZE:
            continue

        # For small clusters (<= 4 items), verify cluster diameter
        # If diameter exceeds max_distance, filter outliers
        # Choose centroid with smallest max distance to other members
        best_centroid = component[0]
        min_cluster_radius = 65
        for candidate in component:
            candidate_max_dist = max(
                adj[candidate].get(other, 64) for other in component if other != candidate
            )
            if candidate_max_dist < min_cluster_radius:
                min_cluster_radius = candidate_max_dist
                best_centroid = candidate

        # Retain members within max_distance of centroid
        valid_members = [
            m
            for m in component
            if m == best_centroid or adj[best_centroid].get(m, 64) <= max_distance
        ]

        if len(valid_members) >= MIN_DUPLICATE_GROUP_SIZE:
            max_dist_in_cluster = max(
                adj[u].get(v, 0)
                for u in valid_members
                for v in valid_members
                if u != v and v in adj[u]
            ) if len(valid_members) > 1 else 0

            centroid_phash = id_to_phash.get(best_centroid, "")
            clusters.append({
                "group_id": f"dup-{best_centroid}-{centroid_phash[:8]}",
                "centroid_id": best_centroid,
                "centroid_phash": centroid_phash,
                "image_ids": valid_members,
                "max_distance": max_dist_in_cluster,
                "similarity_percentage": hamming_similarity_percent(max_dist_in_cluster),
            })

    return clusters


async def get_duplicate_groups(
    db: AsyncSession,
    max_distance: int = 0,
    set_id: Optional[int] = None,
    limit: Optional[int] = None,
) -> list[DuplicateGroup]:
    """
    Retrieve groups of duplicate or near-duplicate images across the library.

    Args:
        db: Async database session
        max_distance: Maximum bitwise Hamming distance (0 = exact match, 1-8 = near duplicates)
        set_id: Optional set ID filter to restrict duplicate detection within a single set
        limit: Optional maximum number of groups to return

    Returns:
        List of DuplicateGroup objects sorted by image resolution/quality
    """
    # 1. Fetch relevant image IDs and perceptual hashes
    query = select(Image.id, Image.phash).where(Image.phash.is_not(None))
    if set_id is not None:
        query = query.where(Image.set_id == set_id)

    rows = (await db.execute(query)).all()
    if len(rows) < MIN_DUPLICATE_GROUP_SIZE:
        return []

    # 2. Parse integer hashes
    items: list[tuple[int, int, str]] = []
    id_to_phash: dict[int, str] = {}
    for rid, phash in rows:
        if phash:
            try:
                h_int = int(phash, 16)
                items.append((rid, h_int, phash))
                id_to_phash[rid] = phash
            except ValueError:
                continue

    if len(items) < MIN_DUPLICATE_GROUP_SIZE:
        return []

    # 3. Offload CPU-bound multi-index matching to worker thread
    matches = await anyio.to_thread.run_sync(find_duplicate_pairs_sync, items, max_distance)
    if not matches:
        return []

    # 4. Cluster matches into coherent groups
    clusters = cluster_duplicate_pairs(matches, id_to_phash, max_distance)
    if not clusters:
        return []

    if limit is not None and limit > 0:
        clusters = clusters[:limit]

    # 5. Fetch full Image entities with set/creator context for all matched IDs
    all_matched_ids = {img_id for c in clusters for img_id in c["image_ids"]}
    images_query = (
        select(Image)
        .where(Image.id.in_(all_matched_ids))
        .options(
            selectinload(Image.set).selectinload(Set.creators),
            selectinload(Image.tags),
            selectinload(Image.characters),
        )
    )
    img_rows = (await db.execute(images_query)).scalars().all()
    images_by_id = {img.id: img for img in img_rows}

    # 6. Map to schemas and determine recommended keep image
    result: list[DuplicateGroup] = []

    for cluster in clusters:
        cluster_images: list[ImageWithContext] = []
        for img_id in cluster["image_ids"]:
            img_model = images_by_id.get(img_id)
            if img_model:
                cluster_images.append(map_image_to_context_schema(img_model))

        if len(cluster_images) < MIN_DUPLICATE_GROUP_SIZE:
            continue

        # Sort images so recommended keep (highest quality score) is first
        cluster_images.sort(key=_score_image_quality, reverse=True)
        recommended_keep_id = cluster_images[0].id

        result.append(
            DuplicateGroup(
                group_id=cluster["group_id"],
                phash=cluster["centroid_phash"] or cluster_images[0].phash or "",
                images=cluster_images,
                recommended_keep_id=recommended_keep_id,
                max_distance=cluster["max_distance"],
                similarity_percentage=cluster["similarity_percentage"],
            )
        )

    return result
