"""
Tests for cross-vault and local library path transfer endpoints.
"""
import io
from pathlib import Path
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.character import Character
from app.models.creator import Creator
from app.models.franchise import Franchise
from app.models.image import Image
from app.models.library_path import LibraryPath
from app.models.set import Set
from app.models.tag import Tag


@pytest.mark.asyncio
async def test_export_set_and_images(client: AsyncClient, db_session: AsyncSession, tmp_path: Path):
    """Test exporting set and cherry-picked images metadata packages."""
    lp = LibraryPath(path=str(tmp_path / "vault_a"), label="Vault A", is_default=True)
    creator = Creator(canonical_name="WLOP", type="Artist", notes="Digital painter")
    franchise = Franchise(name="Ghostblade")
    db_session.add_all([lp, creator, franchise])
    await db_session.flush()

    char = Character(name="Yan", franchise_id=franchise.id)
    tag_set = Tag(name="Fantasy")
    tag_img = Tag(name="Portrait")
    db_session.add_all([char, tag_set, tag_img])
    await db_session.flush()

    db_set = Set(
        title="Aeolian",
        source_url="https://example.com/aeolian",
        local_path=str(tmp_path / "vault_a" / "WLOP - Aeolian"),
        notes="Chapter 1",
        library_path_id=lp.id,
        creators=[creator],
        tags=[tag_set],
        characters=[char],
    )
    db_session.add(db_set)
    await db_session.flush()

    img1 = Image(
        set_id=db_set.id,
        filename="01.jpg",
        local_path=str(tmp_path / "vault_a" / "WLOP - Aeolian" / "01.jpg"),
        phash="a1b2c3d4e5f60718",
        width=1920,
        height=1080,
        file_size=123456,
        aspect_ratio=16 / 9,
        aspect_ratio_label="16:9",
        rating="safe",
        dominant_color="#112233",
        dominant_color_bucket="blue",
        tags=[tag_img],
        characters=[char],
    )
    img2 = Image(
        set_id=db_set.id,
        filename="02.jpg",
        local_path=str(tmp_path / "vault_a" / "WLOP - Aeolian" / "02.jpg"),
        phash="f0f0f0f0f0f0f0f0",
        width=1080,
        height=1920,
        file_size=234567,
        aspect_ratio=9 / 16,
        aspect_ratio_label="9:16",
        rating="safe",
        tags=[],
        characters=[],
    )
    db_session.add_all([img1, img2])
    await db_session.commit()

    # 1. Export full set
    res = await client.get(f"/api/vault/transfer/export/set/{db_set.id}")
    assert res.status_code == 200
    pkg = res.json()
    assert pkg["title"] == "Aeolian"
    assert pkg["source_url"] == "https://example.com/aeolian"
    assert len(pkg["creators"]) == 1
    assert pkg["creators"][0]["canonical_name"] == "WLOP"
    assert pkg["tags"] == ["Fantasy"]
    assert pkg["characters"] == [{"name": "Yan", "franchise_name": "Ghostblade"}]
    assert len(pkg["images"]) == 2

    # 2. Export cherry-picked single image
    res_imgs = await client.get(f"/api/vault/transfer/export/images?image_ids={img1.id}")
    assert res_imgs.status_code == 200
    data_imgs = res_imgs.json()
    assert len(data_imgs["packages"]) == 1
    assert len(data_imgs["packages"][0]["images"]) == 1
    assert data_imgs["packages"][0]["images"][0]["filename"] == "01.jpg"
    assert data_imgs["packages"][0]["images"][0]["tags"] == ["Portrait"]


@pytest.mark.asyncio
async def test_preflight_collision_detection(client: AsyncClient, db_session: AsyncSession, tmp_path: Path):
    """Test preflight detects set collisions, pHash near-duplicates (distance <= 5), and taxonomy."""
    lp = LibraryPath(path=str(tmp_path / "dest"), label="Dest", is_default=True)
    creator = Creator(canonical_name="Sakimichan", type="Artist")
    db_session.add_all([lp, creator])
    await db_session.flush()

    existing_set = Set(
        title="Moonlight",
        source_url="https://example.com/moonlight",
        local_path=str(tmp_path / "dest" / "Sakimichan - Moonlight"),
        library_path_id=lp.id,
        creators=[creator],
    )
    db_session.add(existing_set)
    await db_session.flush()

    # Existing image with phash 0x0000000000000000
    existing_img = Image(
        set_id=existing_set.id,
        filename="moon_01.jpg",
        local_path=str(tmp_path / "dest" / "Sakimichan - Moonlight" / "moon_01.jpg"),
        phash="0000000000000000",
    )
    db_session.add(existing_img)
    await db_session.commit()

    # Incoming package with:
    # - colliding set (by source_url)
    # - 1 near-duplicate image (phash "0000000000000007" -> 3 bits difference <= 5)
    # - 1 distinct image (phash "ffffffffffffffff" -> 64 bits difference > 5)
    payload = {
        "source_set_id": 99,
        "title": "Moonlight",
        "source_url": "https://example.com/moonlight",
        "creators": [
            {"canonical_name": "Sakimichan"},
            {"canonical_name": "NewCollabArtist"},
        ],
        "tags": ["Night"],
        "characters": [{"name": "Ahri", "franchise_name": "League Of Legends"}],
        "images": [
            {
                "id": 501,
                "filename": "dup.jpg",
                "phash": "0000000000000007",
                "tags": [],
                "characters": [],
            },
            {
                "id": 502,
                "filename": "unique.jpg",
                "phash": "ffffffffffffffff",
                "tags": [],
                "characters": [],
            },
        ],
    }

    res = await client.post("/api/vault/transfer/preflight", json=payload)
    assert res.status_code == 200
    report = res.json()
    assert report["transfer_session_id"]
    assert len(report["set_collisions"]) == 1
    assert report["set_collisions"][0]["existing_set_id"] == existing_set.id
    assert report["set_collisions"][0]["match_reason"] == "source_url"

    assert len(report["image_collisions"]) == 1
    assert report["image_collisions"][0]["source_image_id"] == 501
    assert report["image_collisions"][0]["existing_image_id"] == existing_img.id
    assert report["image_collisions"][0]["hamming_distance"] == 3

    assert "Sakimichan" in report["taxonomy"]["existing_creators"]
    assert "NewCollabArtist" in report["taxonomy"]["missing_creators"]
    assert "League Of Legends" in report["taxonomy"]["missing_franchises"]
    assert "Ahri (League Of Legends)" in report["taxonomy"]["missing_characters"]
    assert "Night" in report["taxonomy"]["missing_tags"]


@pytest.mark.asyncio
async def test_ingest_and_finalize_transfer(client: AsyncClient, db_session: AsyncSession, tmp_path: Path):
    """Test full network transfer flow: preflight -> ingest-image -> finalize."""
    dest_dir = tmp_path / "dest_vault"
    dest_dir.mkdir(parents=True, exist_ok=True)
    lp = LibraryPath(path=str(dest_dir), label="Dest Vault", is_default=True)
    db_session.add(lp)
    await db_session.commit()

    package = {
        "source_set_id": 10,
        "title": "Cyberpunk City",
        "source_url": "https://example.com/cyberpunk-city",
        "notes": "Transferred set notes",
        "creators": [{"canonical_name": "NeonArtist", "type": "Artist"}],
        "tags": ["Scifi"],
        "characters": [{"name": "Lucy", "franchise_name": "Cyberpunk Edgerunners"}],
        "images": [
            {
                "id": 1001,
                "filename": "cyber_01.jpg",
                "phash": "1234567890abcdef",
                "width": 1920,
                "height": 1080,
                "file_size": 16,
                "aspect_ratio": 16 / 9,
                "aspect_ratio_label": "16:9",
                "rating": "safe",
                "dominant_color": "#00FFAA",
                "dominant_color_bucket": "teal",
                "tags": ["Neon"],
                "characters": [{"name": "Lucy", "franchise_name": "Cyberpunk Edgerunners"}],
            }
        ],
    }

    # 1. Preflight
    pre_res = await client.post("/api/vault/transfer/preflight", json={"packages": [package]})
    assert pre_res.status_code == 200
    session_id = pre_res.json()["transfer_session_id"]

    # 2. Ingest image binary
    fake_bytes = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01"
    ingest_res = await client.post(
        "/api/vault/transfer/ingest-image",
        data={
            "transfer_session_id": session_id,
            "source_image_id": "1001",
        },
        files={"file": ("cyber_01.jpg", io.BytesIO(fake_bytes), "image/jpeg")},
    )
    assert ingest_res.status_code == 200
    assert ingest_res.json()["status"] == "staged"

    # 3. Finalize
    fin_res = await client.post(
        "/api/vault/transfer/finalize",
        json={
            "transfer_session_id": session_id,
            "packages": [package],
            "set_collision_strategy": "merge",
            "skip_duplicate_images": True,
        },
    )
    assert fin_res.status_code == 200
    fin_data = fin_res.json()
    assert fin_data["transferred_image_count"] == 1
    assert fin_data["skipped_image_count"] == 0
    assert len(fin_data["created_set_ids"]) == 1

    # Verify set and image exist on destination
    created_set_id = fin_data["created_set_ids"][0]
    set_res = await client.get(f"/api/sets/{created_set_id}")
    assert set_res.status_code == 200
    set_json = set_res.json()
    assert set_json["title"] == "Cyberpunk City"
    assert len(set_json["images"]) == 1
    assert Path(set_json["images"][0]["local_path"]).exists()


@pytest.mark.asyncio
async def test_local_library_path_transfer(client: AsyncClient, db_session: AsyncSession, tmp_path: Path):
    """Test local-to-local transfer between two LibraryPaths on the same vault."""
    dir_a = tmp_path / "drive_a"
    dir_b = tmp_path / "drive_b"
    dir_a.mkdir(parents=True, exist_ok=True)
    dir_b.mkdir(parents=True, exist_ok=True)

    lp_a = LibraryPath(path=str(dir_a), label="Drive A", is_default=True)
    lp_b = LibraryPath(path=str(dir_b), label="Drive B", is_default=False)
    creator = Creator(canonical_name="LocalArtist")
    db_session.add_all([lp_a, lp_b, creator])
    await db_session.flush()

    set_dir_a = dir_a / "LocalArtist - Sunset"
    set_dir_a.mkdir(parents=True, exist_ok=True)
    img_file_a = set_dir_a / "sunset_01.jpg"
    img_file_a.write_bytes(b"fake-image-content")

    db_set = Set(
        title="Sunset",
        local_path=str(set_dir_a),
        library_path_id=lp_a.id,
        creators=[creator],
    )
    db_session.add(db_set)
    await db_session.flush()

    img = Image(
        set_id=db_set.id,
        filename="sunset_01.jpg",
        local_path=str(img_file_a),
        phash="1111222233334444",
    )
    db_session.add(img)
    await db_session.commit()

    # Move set to Drive B
    res = await client.post(
        "/api/vault/transfer/local",
        json={
            "set_id": db_set.id,
            "destination_library_path_id": lp_b.id,
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["moved_image_count"] == 1
    assert data["set_ids"] == [db_set.id]

    new_set_dir = dir_b / "LocalArtist - Sunset"
    assert (new_set_dir / "sunset_01.jpg").exists()
    assert not img_file_a.exists()


@pytest.mark.asyncio
async def test_finalize_collision_create_new_and_skip_duplicates(
    client: AsyncClient, db_session: AsyncSession, tmp_path: Path
):
    """Test finalize with create_new collision strategy and skipping duplicate images."""
    dest_dir = tmp_path / "dest_collision"
    dest_dir.mkdir(parents=True, exist_ok=True)
    lp = LibraryPath(path=str(dest_dir), label="Dest", is_default=True)
    creator = Creator(canonical_name="DupeArtist")
    db_session.add_all([lp, creator])
    await db_session.flush()

    existing_set = Set(
        title="Existing Set",
        source_url="https://example.com/existing",
        local_path=str(dest_dir / "DupeArtist - Existing Set"),
        library_path_id=lp.id,
        creators=[creator],
    )
    db_session.add(existing_set)
    await db_session.flush()

    existing_img = Image(
        set_id=existing_set.id,
        filename="already_there.jpg",
        local_path=str(dest_dir / "DupeArtist - Existing Set" / "already_there.jpg"),
        phash="aaaa0000aaaa0000",
    )
    db_session.add(existing_img)
    await db_session.commit()

    package = {
        "source_set_id": 55,
        "title": "Existing Set",
        "source_url": "https://example.com/existing",
        "creators": [{"canonical_name": "DupeArtist"}],
        "tags": [],
        "characters": [],
        "images": [
            {
                "id": 2001,
                "filename": "already_there.jpg",
                "phash": "aaaa0000aaaa0000",
                "tags": [],
                "characters": [],
            },
            {
                "id": 2002,
                "filename": "brand_new.jpg",
                "phash": "bbbb1111bbbb1111",
                "tags": [],
                "characters": [],
            },
        ],
    }

    pre_res = await client.post("/api/vault/transfer/preflight", json={"packages": [package]})
    session_id = pre_res.json()["transfer_session_id"]

    # Only stage the non-skipped image (2002)
    await client.post(
        "/api/vault/transfer/ingest-image",
        data={"transfer_session_id": session_id, "source_image_id": "2002"},
        files={"file": ("brand_new.jpg", io.BytesIO(b"new-img-bytes"), "image/jpeg")},
    )

    fin_res = await client.post(
        "/api/vault/transfer/finalize",
        json={
            "transfer_session_id": session_id,
            "packages": [package],
            "set_collision_strategy": "create_new",
            "skip_duplicate_images": True,
            "excluded_source_image_ids": [2001],
        },
    )
    assert fin_res.status_code == 200
    fin_data = fin_res.json()
    assert fin_data["transferred_image_count"] == 1
    assert fin_data["skipped_image_count"] == 1
    assert fin_data["created_set_ids"][0] != existing_set.id

