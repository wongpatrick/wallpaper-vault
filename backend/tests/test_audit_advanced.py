import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
import tempfile
from pathlib import Path
import cv2
import numpy as np

@pytest.fixture
def temp_vault():
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.mark.asyncio
async def test_audit_create_and_import(client: AsyncClient, temp_vault: Path, db_session: AsyncSession):
    """Test the 'create_and_import' resolution for orphaned folders."""
    await client.put("/api/settings/base_library_path", json={"value": str(temp_vault)})
    
    # 1. Create a physical folder inside the vault that the DB doesn't know about
    orphan_folder = temp_vault / "Orphan Creator - Orphan Set"
    orphan_folder.mkdir()
    
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    img_path = orphan_folder / "orphan_img.jpg"
    cv2.imwrite(str(img_path), img)
    
    # 2. Run Audit synchronously
    from app.services import audit_service
    
    class MockSessionLocal:
        async def __aenter__(self):
            return db_session
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass
            
    audit_service.SessionLocal = MockSessionLocal
    
    resp = await client.post("/api/audit/start", json={"quick_scan": True})
    assert resp.status_code == 200
    
    import asyncio
    await asyncio.sleep(0.5)
    
    # 3. Fetch audit results
    resp = await client.get("/api/audit/results")
    assert resp.status_code == 200
    results = resp.json()
    
    # Should detect 1 orphan
    assert results["total"] >= 1
    orphan_issue = next((issue for issue in results["items"] if issue["issue_type"] == "orphan" and issue["path"].endswith("orphan_img.jpg")), None)
    assert orphan_issue is not None
    
    issue_id = orphan_issue["id"]
    
    # 4. Resolve via create_and_import
    resp = await client.post("/api/audit/resolve", json={
        "issue_ids": [issue_id],
        "action": "create_and_import"
    })
    assert resp.status_code == 200
    assert resp.json()["resolved_count"] == 1
    
    # 5. Verify the Set and Creator were created
    resp = await client.get("/api/sets/")
    sets = resp.json()["items"]
    imported_set = next((s for s in sets if s["title"] == "Orphan Set"), None)
    
    assert imported_set is not None
    assert "Orphan Creator" in imported_set["creators"][0]["canonical_name"]
    assert len(imported_set["images"]) == 1
    assert imported_set["images"][0]["filename"] == "orphan_img.jpg"

@pytest.mark.asyncio
async def test_audit_ignore(client: AsyncClient, temp_vault: Path, db_session: AsyncSession):
    """Test ignoring an audit issue."""
    await client.put("/api/settings/base_library_path", json={"value": str(temp_vault)})
    
    # Create an orphan
    orphan_folder = temp_vault / "Ignore Me"
    orphan_folder.mkdir()
    img_path = orphan_folder / "ignore.jpg"
    cv2.imwrite(str(img_path), np.zeros((10, 10, 3), dtype=np.uint8))
    
    from app.services import audit_service
    class MockSessionLocal:
        async def __aenter__(self):
            return db_session
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass
    audit_service.SessionLocal = MockSessionLocal
    
    await client.post("/api/audit/start", json={"quick_scan": True})
    
    import asyncio
    await asyncio.sleep(0.5)
    
    resp = await client.get("/api/audit/results")
    results = resp.json()
    issue_id = results["items"][0]["id"]
    
    resp = await client.post("/api/audit/resolve", json={
        "issue_ids": [issue_id],
        "action": "ignore"
    })
    assert resp.status_code == 200
    assert resp.json()["resolved_count"] == 1
    
    # The issue should now be filtered out of the 'pending' view
    resp = await client.get("/api/audit/results")
    assert len(resp.json()["items"]) == 0
