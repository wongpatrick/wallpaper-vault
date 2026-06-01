import pytest
from httpx import AsyncClient
from unittest.mock import patch

@pytest.mark.asyncio
async def test_audit_start_no_path(client: AsyncClient):
    """
    Test that starting an audit fails if base_library_path is not set.
    """
    # Ensure setting is empty
    await client.put("/api/settings/base_library_path", json={"value": ""})
    
    response = await client.post("/api/audit/start", json={"quick_scan": True})
    assert response.status_code == 400
    assert "not configured" in response.text

@pytest.mark.asyncio
@patch("app.api.audit.audit_service.run_library_audit")
async def test_audit_start_and_status(mock_run, client: AsyncClient):
    """
    Test starting an audit and checking its status.
    """
    # Set path
    await client.put("/api/settings/base_library_path", json={"value": "/tmp"})
    
    # Start audit
    response = await client.post("/api/audit/start", json={"quick_scan": True})
    assert response.status_code == 200
    data = response.json()
    assert "task_id" in data
    assert data["status"] == "accepted"
    
    # Check current
    response = await client.get("/api/audit/current")
    assert response.status_code == 200
    current = response.json()
    assert current["task_id"] == data["task_id"]

@pytest.mark.asyncio
async def test_audit_results_empty(client: AsyncClient):
    """
    Test getting audit results when there are none.
    """
    response = await client.get("/api/audit/results")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert len(data["items"]) == 0
