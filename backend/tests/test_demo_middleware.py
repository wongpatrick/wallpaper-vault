"""
Unit and integration tests for DemoSandboxMiddleware and read-only sandbox mode.
"""
import pytest
from httpx import AsyncClient
from app.core.config import settings


@pytest.mark.asyncio
async def test_demo_mode_disabled_by_default(client: AsyncClient):
    """Ensure that by default when DEMO_MODE=False, requests are not blocked by demo sandbox."""
    assert settings.DEMO_MODE is False
    response = await client.get("/api/settings/")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_demo_mode_blocks_modifying_methods(client: AsyncClient, monkeypatch):
    """
    Ensure that when DEMO_MODE=True:
    - Safe methods (GET, HEAD, OPTIONS) are allowed.
    - Modifying methods (POST, PUT, PATCH, DELETE) are rejected with 403 Forbidden.
    - Healthcheck endpoints remain accessible.
    """
    monkeypatch.setattr(settings, "DEMO_MODE", True)

    # 1. Healthcheck is allowed
    res_health = await client.get("/health")
    assert res_health.status_code == 200

    res_api_health = await client.get("/api/health")
    assert res_api_health.status_code == 200

    # 2. GET requests are allowed
    res_get = await client.get("/api/settings/")
    assert res_get.status_code == 200

    # 3. POST is blocked with 403
    res_post = await client.post("/api/sets/", json={"title": "Test Set"})
    assert res_post.status_code == 403
    assert "read-only demo" in res_post.json()["detail"]

    # 4. PUT is blocked with 403
    res_put = await client.put("/api/sets/1", json={"title": "Updated Title"})
    assert res_put.status_code == 403
    assert "read-only demo" in res_put.json()["detail"]

    # 5. PATCH is blocked with 403
    res_patch = await client.patch("/api/images/1", json={"rating": 1})
    assert res_patch.status_code == 403
    assert "read-only demo" in res_patch.json()["detail"]

    # 6. DELETE is blocked with 403
    res_delete = await client.delete("/api/images/1")
    assert res_delete.status_code == 403
    assert "read-only demo" in res_delete.json()["detail"]

    # 7. HEAD and OPTIONS are not blocked by demo middleware
    res_head = await client.head("/health")
    assert res_head.status_code != 403

    res_options = await client.options("/api/sets/")
    assert res_options.status_code != 403


