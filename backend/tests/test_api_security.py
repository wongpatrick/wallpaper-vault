import pytest
from httpx import AsyncClient
from app.core.config import settings

@pytest.mark.asyncio
async def test_auth_disabled_by_default(client: AsyncClient):
    """
    Ensure that by default (when API_KEY is empty/unset), the system does not require authentication.
    """
    # Ensure healthcheck (root) works
    response = await client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    
    # Ensure api routes work since settings.API_KEY is empty by default in tests
    assert settings.API_KEY == ""
    response = await client.get("/api/settings/")
    assert response.status_code == 200

@pytest.mark.asyncio
async def test_auth_enabled(client: AsyncClient, monkeypatch):
    """
    Ensure that when API_KEY is configured, all API endpoints are secured and reject unauthorized requests,
    while accepting valid keys in headers or query parameters.
    """
    # Enable API Key authentication in settings for this test
    monkeypatch.setattr(settings, "API_KEY", "test-secret-token")
    
    # 1. Root healthcheck should still be public
    response = await client.get("/")
    assert response.status_code == 200
    
    # 2. API route should return 401 Unauthorized without key
    response = await client.get("/api/settings/")
    assert response.status_code == 401
    assert "Missing API Key" in response.json()["detail"]
    
    # 3. API route should return 401 with incorrect header key
    response = await client.get("/api/settings/", headers={"X-API-Key": "wrong-token"})
    assert response.status_code == 401
    assert "Invalid API Key" in response.json()["detail"]
    
    # 4. API route should return 401 with incorrect query param key
    response = await client.get("/api/settings/", params={"api_key": "wrong-token"})
    assert response.status_code == 401
    assert "Invalid API Key" in response.json()["detail"]
    
    # 5. API route should return 200 with correct X-API-Key header
    response = await client.get("/api/settings/", headers={"X-API-Key": "test-secret-token"})
    assert response.status_code == 200
    
    # 6. API route should return 200 with correct api_key query parameter
    response = await client.get("/api/settings/", params={"api_key": "test-secret-token"})
    assert response.status_code == 200
