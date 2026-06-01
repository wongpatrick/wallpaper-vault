import pytest
from httpx import AsyncClient
from unittest.mock import patch
import tempfile
from pathlib import Path
import cv2
import numpy as np

@pytest.fixture
def mock_import_dir():
    with tempfile.TemporaryDirectory() as tmpdir:
        base = Path(tmpdir)
        # Create a mock folder structure: /tmpdir/CreatorName - SetTitle/
        folder = base / "Batch Creator - Awesome Set"
        folder.mkdir()
        
        # Add an image
        img = np.zeros((100, 100, 3), dtype=np.uint8)
        cv2.imwrite(str(folder / "img1.jpg"), img)
        
        yield base

@pytest.mark.asyncio
async def test_batch_import_dry_run(client: AsyncClient, mock_import_dir: Path):
    """Test that dry_run scans and parses the folders without importing."""
    
    payload = {
        "items": [
            {"source_path": str(mock_import_dir / "Batch Creator - Awesome Set")}
        ],
        "parsing_template": "[Creator] - [Set]",
        "delete_source_default": False,
        "dry_run": True
    }
    
    resp = await client.post("/api/sets/batch-import", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    
    assert len(data["items"]) == 1
    item = data["items"][0]
    
    assert item["status"] == "pending"
    assert item["creator_name"] == "Batch Creator"
    assert item["set_title"] == "Awesome Set"

@pytest.mark.asyncio
@patch("app.api.sets.crud_set.run_batch_import_background")
async def test_batch_import_background_task(mock_run, client: AsyncClient, mock_import_dir: Path):
    """Test that executing a batch import spawns a task."""
    
    # Requires base library path
    with tempfile.TemporaryDirectory() as vault_dir:
        await client.put("/api/settings/base_library_path", json={"value": vault_dir})
        
        payload = {
            "items": [
                {"source_path": str(mock_import_dir / "Batch Creator - Awesome Set")}
            ],
            "parsing_template": "[Creator] - [Set]",
            "delete_source_default": False,
            "dry_run": False
        }
        
        resp = await client.post("/api/sets/batch-import", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        
        assert "task_id" in data
        assert data["status"] == "accepted"
