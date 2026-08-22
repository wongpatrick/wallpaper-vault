import pytest
from pathlib import Path
import cv2
import numpy as np
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.set import Set
from app.services.library_scan_service import scan_library_path_background_task

@pytest.fixture
def temp_vaults(tmp_path: Path):
    vault1 = tmp_path / "vault1"
    vault2 = tmp_path / "vault2"
    vault1.mkdir(parents=True, exist_ok=True)
    vault2.mkdir(parents=True, exist_ok=True)
    return vault1, vault2

@pytest.mark.asyncio
async def test_library_paths_crud(client: AsyncClient, temp_vaults: tuple[Path, Path]):
    vault1, vault2 = temp_vaults

    # 1. List initial paths
    res = await client.get("/api/library-paths/")
    assert res.status_code == 200
    initial_total = res.json()["total"]

    # 2. Create first library path (should auto-become default)
    res = await client.post("/api/library-paths/", json={
        "path": str(vault1),
        "label": "Primary Storage",
        "is_default": False,
        "scan_existing": False
    })
    assert res.status_code == 200
    p1 = res.json()
    assert p1["path"] == str(vault1).replace('\\', '/')
    assert p1["label"] == "Primary Storage"
    assert p1["is_default"] is True  # First path auto-becomes default

    # 3. Create second library path
    res = await client.post("/api/library-paths/", json={
        "path": str(vault2),
        "label": "Secondary Storage",
        "is_default": False,
        "scan_existing": False
    })
    assert res.status_code == 200
    p2 = res.json()
    assert p2["is_default"] is False

    # 4. Prevent duplicate path
    res = await client.post("/api/library-paths/", json={
        "path": str(vault1),
        "label": "Duplicate",
        "scan_existing": False
    })
    assert res.status_code == 400

    # 5. List paths
    res = await client.get("/api/library-paths/")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == initial_total + 2

    # 6. Update second path to be default
    res = await client.put(f"/api/library-paths/{p2['id']}", json={
        "is_default": True,
        "label": "NAS Vault"
    })
    assert res.status_code == 200
    updated_p2 = res.json()
    assert updated_p2["is_default"] is True
    assert updated_p2["label"] == "NAS Vault"

    # Verify first path is no longer default
    res = await client.get(f"/api/library-paths/{p1['id']}")
    assert res.status_code == 200
    assert res.json()["is_default"] is False

    # 7. Delete path
    res = await client.delete(f"/api/library-paths/{p2['id']}")
    assert res.status_code == 200

    # Verify p1 becomes default again after p2 is deleted
    res = await client.get(f"/api/library-paths/{p1['id']}")
    assert res.status_code == 200
    assert res.json()["is_default"] is True

@pytest.mark.asyncio
async def test_set_creation_in_specific_library_path(client: AsyncClient, temp_vaults: tuple[Path, Path]):
    vault1, vault2 = temp_vaults

    # Register both paths
    res1 = await client.post("/api/library-paths/", json={
        "path": str(vault1),
        "label": "Vault 1",
        "is_default": True,
        "scan_existing": False
    })
    p1 = res1.json()

    res2 = await client.post("/api/library-paths/", json={
        "path": str(vault2),
        "label": "Vault 2",
        "is_default": False,
        "scan_existing": False
    })
    p2 = res2.json()

    # Create set targeting Vault 2
    res = await client.post("/api/sets/", json={
        "title": "Neon Sunset",
        "library_path_id": p2["id"]
    })
    assert res.status_code == 200
    s2 = res.json()
    assert s2["library_path_id"] == p2["id"]
    assert str(vault2).replace('\\', '/').lower() in s2["local_path"].replace('\\', '/').lower()

    # Create set without explicit library_path_id (should default to Vault 1)
    res = await client.post("/api/sets/", json={
        "title": "Ocean Waves"
    })
    assert res.status_code == 200
    s1 = res.json()
    assert s1["library_path_id"] == p1["id"]
    assert str(vault1).replace('\\', '/').lower() in s1["local_path"].replace('\\', '/').lower()

    # Check set count in library paths list
    res = await client.get("/api/library-paths/")
    assert res.status_code == 200
    items = {item["id"]: item["set_count"] for item in res.json()["items"]}
    assert items[p1["id"]] >= 1
    assert items[p2["id"]] >= 1

    # Delete library path 2 and check that set is unlinked but preserved
    res = await client.delete(f"/api/library-paths/{p2['id']}")
    assert res.status_code == 200

    res = await client.get(f"/api/sets/{s2['id']}")
    assert res.status_code == 200
    assert res.json()["library_path_id"] is None

@pytest.mark.asyncio
async def test_library_scan_background_task(client: AsyncClient, db_session: AsyncSession, tmp_path: Path):
    scan_vault = tmp_path / "scan_vault"
    scan_vault.mkdir(parents=True, exist_ok=True)

    # Create mock set folders with image files
    set_folder = scan_vault / "Kuvshinov - Cyberpunk Girl"
    set_folder.mkdir(parents=True, exist_ok=True)
    img_path = set_folder / "cover.jpg"

    dummy_img = np.zeros((100, 100, 3), dtype=np.uint8)
    cv2.imwrite(str(img_path), dummy_img)

    # Add library path and trigger scan
    res = await client.post("/api/library-paths/", json={
        "path": str(scan_vault),
        "label": "Auto Scan Vault",
        "is_default": False,
        "scan_existing": False
    })
    assert res.status_code == 200
    lp = res.json()

    # Create background task and run scan background worker directly
    from app.core import tasks
    task_id = await tasks.create_task(db_session, prefix="scan")
    await scan_library_path_background_task(lp["id"], task_id, db=db_session)

    from sqlalchemy import select
    all_sets_res = await db_session.execute(select(Set))
    direct_sets = all_sets_res.scalars().all()
    assert len(direct_sets) >= 1

    # Verify set was created
    res = await client.get("/api/sets/")
    assert res.status_code == 200
    sets = res.json()["items"]
    assert any(s["title"] == "Cyberpunk Girl" for s in sets)
