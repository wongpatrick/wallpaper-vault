import pytest
from unittest.mock import patch, MagicMock
from httpx import AsyncClient
import sys
from app.models.image import Image
from app.models.set import Set

@pytest.fixture
async def sample_image(db_session):
    # Create a dummy set and image to test the reveal endpoint
    test_set = Set(title="Test Set")
    db_session.add(test_set)
    await db_session.commit()
    
    test_image = Image(
        set_id=test_set.id,
        filename="test.jpg",
        local_path="C:\\fake\\path\\test.jpg" if sys.platform == "win32" else "/fake/path/test.jpg"
    )
    db_session.add(test_image)
    await db_session.commit()
    return test_image

@pytest.mark.asyncio
@patch("app.api.images.subprocess.run")
@patch("app.api.images.sys.platform", "win32")
@patch("app.api.images.Path.exists", return_value=True)
async def test_reveal_windows(mock_exists, mock_run, sample_image, client: AsyncClient):
    response = await client.post(f"/api/images/{sample_image.id}/reveal")
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    # Windows should use explorer /select
    mock_run.assert_called_once()
    args = mock_run.call_args[0][0]
    assert args[0] == "explorer"
    assert args[1] == "/select,"
    assert sample_image.local_path in args[2]

@pytest.mark.asyncio
@patch("app.api.images.subprocess.run")
@patch("app.api.images.sys.platform", "darwin")
@patch("app.api.images.Path.exists", return_value=True)
async def test_reveal_macos(mock_exists, mock_run, sample_image, client: AsyncClient):
    response = await client.post(f"/api/images/{sample_image.id}/reveal")
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    # macOS should use open -R
    mock_run.assert_called_once()
    args = mock_run.call_args[0][0]
    assert args[0] == "open"
    assert args[1] == "-R"
    assert sample_image.local_path in args[2]

@pytest.mark.asyncio
@patch("app.api.images.subprocess.run")
@patch("app.api.images.sys.platform", "linux")
@patch("app.api.images.Path.exists", return_value=True)
async def test_reveal_linux_dbus(mock_exists, mock_run, sample_image, client: AsyncClient):
    response = await client.post(f"/api/images/{sample_image.id}/reveal")
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    # Linux should try dbus-send first
    mock_run.assert_called_once()
    args = mock_run.call_args[0][0]
    assert args[0] == "dbus-send"
    assert f"file://{sample_image.local_path}" in args[5]
