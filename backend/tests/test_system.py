import pytest
from httpx import AsyncClient
from unittest.mock import patch, MagicMock

@pytest.mark.asyncio
async def test_settings_api(client: AsyncClient):
    """
    Test the settings API endpoints.
    """
    # 1. Update/Create a setting
    payload = {
        "value": "/tmp/vault_test",
        "description": "Test vault directory"
    }
    response = await client.put("/api/settings/base_library_path", json=payload)
    assert response.status_code == 200
    setting = response.json()
    assert setting["key"] == "base_library_path"
    assert setting["value"] == "/tmp/vault_test"

    # 2. Get specific setting
    response = await client.get("/api/settings/base_library_path")
    assert response.status_code == 200
    setting = response.json()
    assert setting["value"] == "/tmp/vault_test"

    # 3. Get all settings
    response = await client.get("/api/settings/")
    assert response.status_code == 200
    settings = response.json()
    assert isinstance(settings, list)
    assert len(settings) >= 1
    assert any(s["key"] == "base_library_path" for s in settings)

@pytest.mark.asyncio
async def test_dashboard_api_empty(client: AsyncClient):
    """
    Test the dashboard API when DB is empty.
    """
    response = await client.get("/api/dashboard/")
    assert response.status_code == 200
    data = response.json()
    assert "stats" in data
    stats = data["stats"]
    assert "total_images" in stats
    assert "total_sets" in stats
    assert "total_creators" in stats
    assert "health_alerts" in data
    
    assert stats["total_images"] == 0
    assert stats["total_sets"] == 0
    assert stats["total_creators"] == 0
    assert "database_size_bytes" in stats
    assert isinstance(stats["database_size_bytes"], int)
    assert stats["database_size_bytes"] >= 0

@pytest.mark.asyncio
async def test_dashboard_api_with_data(client: AsyncClient):
    """
    Test the dashboard API reflects data changes.
    """
    # Create creator
    resp = await client.post("/api/creators/", json={"canonical_name": "Dash Artist"})
    creator_id = resp.json()["id"]

    # Create set
    resp = await client.post("/api/sets/", json={
        "title": "Dash Set", 
        "creator_ids": [creator_id],
        "local_path": "/tmp/dash"
    })
    set_id = resp.json()["id"]

    # Create image
    await client.post(f"/api/images/set/{set_id}", json={
        "filename": "dash.jpg",
        "local_path": "/tmp/dash/dash.jpg",
        "width": 1920,
        "height": 1080
    })

    response = await client.get("/api/dashboard/")
    assert response.status_code == 200
    data = response.json()
    stats = data["stats"]
    assert stats["total_images"] == 1
    assert stats["total_sets"] == 1
    assert stats["total_creators"] == 1
    assert "database_size_bytes" in stats
    assert isinstance(stats["database_size_bytes"], int)
    assert stats["database_size_bytes"] >= 0

@pytest.mark.asyncio
@patch("huggingface_hub.HfApi")
async def test_settings_ai_validation(mock_hf_api, client: AsyncClient, tmp_path):
    """Test AI model settings update validation logic."""
    # 1. Validate ai_model_source
    resp = await client.put("/api/settings/ai_model_source", json={"value": "invalid_source"})
    assert resp.status_code == 400
    assert "Invalid model source" in resp.json()["detail"]

    resp = await client.put("/api/settings/ai_model_source", json={"value": "local"})
    assert resp.status_code == 200

    # 2. Validate ai_model_custom_path
    # Path doesn't exist
    resp = await client.put("/api/settings/ai_model_custom_path", json={"value": "/nonexistent/path"})
    assert resp.status_code == 400

    # Path exists but is empty
    resp = await client.put("/api/settings/ai_model_custom_path", json={"value": str(tmp_path)})
    assert resp.status_code == 400
    assert "must contain at least one '.onnx'" in resp.json()["detail"]

    # Path exists and contains required files
    (tmp_path / "model.onnx").write_bytes(b"")
    (tmp_path / "tags.csv").write_text("")
    resp = await client.put("/api/settings/ai_model_custom_path", json={"value": str(tmp_path)})
    assert resp.status_code == 200

    # 3. Validate ai_model_custom_repo
    # Invalid format
    resp = await client.put("/api/settings/ai_model_custom_repo", json={"value": "invalid_format"})
    assert resp.status_code == 400

    # Non-existent repository (throws RepositoryNotFoundError)
    from huggingface_hub.utils import RepositoryNotFoundError
    mock_api_instance = MagicMock()
    mock_response = MagicMock(status_code=404, headers={})
    mock_api_instance.model_info.side_effect = RepositoryNotFoundError("Not found", response=mock_response)
    mock_hf_api.return_value = mock_api_instance

    resp = await client.put("/api/settings/ai_model_custom_repo", json={"value": "user/nonexistent"})
    assert resp.status_code == 400
    assert "not found" in resp.json()["detail"]

    # Valid repository
    mock_api_instance.model_info.side_effect = None
    mock_api_instance.model_info.return_value = MagicMock()
    resp = await client.put("/api/settings/ai_model_custom_repo", json={"value": "SmilingWolf/wd-v1-4-convnext-tagger-v2"})
    assert resp.status_code == 200
