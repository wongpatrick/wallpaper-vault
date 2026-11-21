"""
Unit and integration tests for duplicate detection, multi-index pHash matching,
Hamming distance calculations, and clustering.
"""

import pytest
from app.core.image_analysis import hamming_distance_hex, hamming_similarity_percent
from app.services.duplicate_service import (
    cluster_duplicate_pairs,
    find_duplicate_pairs_sync,
    get_duplicate_groups,
)
from app.models.image import Image
from app.models.set import Set
from app.models.creator import Creator


def test_hamming_distance_hex():
    """Verify bitwise Hamming distance between 64-bit hex strings."""
    # Identical
    assert hamming_distance_hex("0000000000000000", "0000000000000000") == 0
    assert hamming_distance_hex("ffffffffffffffff", "ffffffffffffffff") == 0

    # 1 bit difference
    assert hamming_distance_hex("0000000000000000", "0000000000000001") == 1
    assert hamming_distance_hex("0000000000000000", "8000000000000000") == 1

    # Completely inverted 64 bits
    assert hamming_distance_hex("0000000000000000", "ffffffffffffffff") == 64

    # Invalid input handling
    assert hamming_distance_hex("not-a-hex", "ffffffffffffffff") is None
    assert hamming_distance_hex(None, "ffffffffffffffff") is None  # type: ignore[arg-type]


def test_hamming_similarity_percent():
    """Verify conversion of distance to percentage similarity."""
    assert hamming_similarity_percent(0) == 100.0
    assert hamming_similarity_percent(64) == 0.0
    assert hamming_similarity_percent(32) == 50.0
    # 3 bits difference in 64 bits = (61/64)*100 = 95.3125 -> 95.3%
    assert hamming_similarity_percent(3) == 95.3
    # Boundary clamps
    assert hamming_similarity_percent(-5) == 100.0
    assert hamming_similarity_percent(100) == 0.0


def test_find_duplicate_pairs_sync_empty_and_single():
    """Empty or single item returns no pairs."""
    assert find_duplicate_pairs_sync([], max_distance=0) == []
    assert find_duplicate_pairs_sync([(1, 0x1234, "1234")], max_distance=0) == []
    assert find_duplicate_pairs_sync([(1, 0x1234, "1234")], max_distance=5) == []


def test_find_duplicate_pairs_sync_exact_matches():
    """Test max_distance=0 exact matches fast path."""
    items = [
        (1, 0xAAAA_BBBB_CCCC_DDDD, "aaaabbbbccccdddd"),
        (2, 0xAAAA_BBBB_CCCC_DDDD, "aaaabbbbccccdddd"),  # Exact match with 1
        (3, 0x1111_2222_3333_4444, "1111222233334444"),
        (4, 0xAAAA_BBBB_CCCC_DDDE, "aaaabbbbccccddde"),  # 1 bit diff from 1 (should NOT match)
    ]

    pairs = find_duplicate_pairs_sync(items, max_distance=0)
    assert len(pairs) == 1
    assert pairs[0][0] == 1
    assert pairs[0][1] == 2
    assert pairs[0][2] == 0


def test_find_duplicate_pairs_sync_near_duplicates():
    """Test multi-index matching with near duplicates (distance <= 4)."""
    base_hash = 0x1234_5678_9ABC_DEF0
    # 1 bit diff (last bit)
    diff_1 = 0x1234_5678_9ABC_DEF1
    # 3 bits diff
    diff_3 = 0x1234_5678_9ABC_DEF7
    # 8 bits diff (different image)
    diff_8 = 0x1234_5678_9ABC_FF00

    items = [
        (10, base_hash, hex(base_hash)[2:]),
        (20, diff_1, hex(diff_1)[2:]),
        (30, diff_3, hex(diff_3)[2:]),
        (40, diff_8, hex(diff_8)[2:]),
    ]

    # Threshold = 3: pairs (10, 20 [dist=1]), (10, 30 [dist=3]), (20, 30 [dist=2])
    pairs = find_duplicate_pairs_sync(items, max_distance=3)
    matched_id_pairs = {(p[0], p[1]) for p in pairs}

    assert (10, 20) in matched_id_pairs
    assert (10, 30) in matched_id_pairs
    assert (20, 30) in matched_id_pairs
    # 40 (diff_8) must not match any
    assert not any(40 in pair for pair in matched_id_pairs)


def test_cluster_duplicate_pairs():
    """Test clustering pairs and avoiding transitive concept drift."""
    # 1 matches 2 (dist=2), 2 matches 3 (dist=3)
    # But 1 and 3 are dist=5 (above max_distance=4)
    matches = [
        (1, 2, 2),
        (2, 3, 3),
    ]
    id_to_phash = {1: "hash1", 2: "hash2", 3: "hash3"}

    # With max_distance=3, centroid 2 is within <= 3 of both 1 and 3
    clusters = cluster_duplicate_pairs(matches, id_to_phash, max_distance=3)
    assert len(clusters) == 1
    assert set(clusters[0]["image_ids"]) == {1, 2, 3}
    assert clusters[0]["centroid_id"] == 2


@pytest.mark.asyncio
async def test_get_duplicate_groups_in_db(db_session):
    """Integration test: query duplicate groups from database with exact and near match."""
    # Create test Set and Creator
    creator = Creator(canonical_name="Artist DuplicateTest")
    db_session.add(creator)
    await db_session.flush()

    s = Set(title="Duplicate Test Set", creators=[creator])
    db_session.add(s)
    await db_session.flush()

    # Image 1: High res
    img1 = Image(
        filename="img1.jpg",
        local_path="/fake/img1.jpg",
        phash="123456789abcdef0",
        width=3840,
        height=2160,
        file_size=5_000_000,
        set_id=s.id,
    )
    # Image 2: Identical phash, lower res
    img2 = Image(
        filename="img2.jpg",
        local_path="/fake/img2.jpg",
        phash="123456789abcdef0",
        width=1920,
        height=1080,
        file_size=1_000_000,
        set_id=s.id,
    )
    # Image 3: 2-bit difference (near duplicate)
    img3 = Image(
        filename="img3.jpg",
        local_path="/fake/img3.jpg",
        phash="123456789abcdef3",  # 2 bits different from img1
        width=2560,
        height=1440,
        file_size=2_000_000,
        set_id=s.id,
    )
    # Image 4: Completely distinct
    img4 = Image(
        filename="img4.jpg",
        local_path="/fake/img4.jpg",
        phash="ffffffffffffffff",
        width=1920,
        height=1080,
        file_size=1_000_000,
        set_id=s.id,
    )

    db_session.add_all([img1, img2, img3, img4])
    await db_session.commit()

    # 1. Test Exact Match (max_distance=0)
    exact_groups = await get_duplicate_groups(db_session, max_distance=0, set_id=s.id)
    assert len(exact_groups) == 1
    assert len(exact_groups[0].images) == 2
    assert exact_groups[0].recommended_keep_id == img1.id  # Higher res kept
    assert exact_groups[0].max_distance == 0
    assert exact_groups[0].similarity_percentage == 100.0

    # 2. Test Near Match (max_distance=3)
    near_groups = await get_duplicate_groups(db_session, max_distance=3, set_id=s.id)
    assert len(near_groups) == 1
    assert len(near_groups[0].images) == 3
    # img1 is highest res (4K) so should be recommended keep
    assert near_groups[0].recommended_keep_id == img1.id
    assert near_groups[0].max_distance <= 3
    assert near_groups[0].similarity_percentage >= 95.0
