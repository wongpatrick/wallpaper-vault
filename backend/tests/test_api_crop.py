import os
import pytest
from httpx import AsyncClient
import tempfile
from pathlib import Path
import cv2
from tests.utils import create_synthetic_saliency_image, save_temp_image

@pytest.fixture
def temp_vault():
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)

@pytest.mark.asyncio
async def test_api_crop_preview(client: AsyncClient, temp_vault: Path):
    """
    Test cropping an image preview returns crop coordinates.
    """
    await client.put("/api/settings/base_library_path", json={"value": str(temp_vault)})
    
    # Create creator and set
    resp = await client.post("/api/creators/", json={"canonical_name": "Test Artist"})
    creator_id = resp.json()["id"]
    
    resp = await client.post("/api/sets/", json={
        "title": "Test Set",
        "creator_ids": [creator_id]
    })
    set_id = resp.json()["id"]
    set_path = Path(resp.json()["local_path"])
    
    # Save a synthetic physical image (vertical: 1000x2000)
    img_data = create_synthetic_saliency_image(width=1000, height=2000)
    img_path = set_path / "original.jpg"
    save_temp_image(img_data, img_path)
    
    # Register image in DB
    resp = await client.post(f"/api/images/set/{set_id}", json={
        "filename": "original.jpg",
        "local_path": str(img_path)
    })
    assert resp.status_code == 200
    image_id = resp.json()["id"]
    
    # Request crop preview (automatic crop to 16:9)
    resp = await client.post(f"/api/images/{image_id}/crop", json={
        "aspect_ratio": "16:9",
        "save_mode": "new",
        "preview_only": True
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["x"] is not None
    assert data["y"] is not None
    assert data["width"] is not None
    assert data["height"] is not None
    assert data["image"] is None
    
    # Target crop width should be 1000 (full width since aspect ratio is 16:9 and original is 1000x2000)
    # Target crop height should be 1000 / (16/9) = 563
    assert data["width"] == 1000
    assert data["height"] == 563

@pytest.mark.asyncio
async def test_api_crop_save_new(client: AsyncClient, temp_vault: Path):
    """
    Test cropping an image and saving it as a new wallpaper copy.
    """
    await client.put("/api/settings/base_library_path", json={"value": str(temp_vault)})
    
    resp = await client.post("/api/creators/", json={"canonical_name": "Test Artist"})
    creator_id = resp.json()["id"]
    
    resp = await client.post("/api/sets/", json={
        "title": "Test Set",
        "creator_ids": [creator_id]
    })
    set_id = resp.json()["id"]
    set_path = Path(resp.json()["local_path"])
    
    img_data = create_synthetic_saliency_image(width=1000, height=2000)
    img_path = set_path / "original.jpg"
    save_temp_image(img_data, img_path)
    
    resp = await client.post(f"/api/images/set/{set_id}", json={
        "filename": "original.jpg",
        "local_path": str(img_path)
    })
    image_id = resp.json()["id"]
    
    # Save a crop as a new file (custom coordinates)
    resp = await client.post(f"/api/images/{image_id}/crop", json={
        "x": 100,
        "y": 100,
        "width": 800,
        "height": 450,
        "save_mode": "new",
        "preview_only": False
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["image"] is not None
    new_image = data["image"]
    assert new_image["id"] != image_id
    assert new_image["width"] == 800
    assert new_image["height"] == 450
    assert os.path.exists(new_image["local_path"])
    assert "crop_16x9" in new_image["filename"]

@pytest.mark.asyncio
async def test_api_crop_save_replace(client: AsyncClient, temp_vault: Path):
    """
    Test cropping an image and replacing the original in place.
    """
    await client.put("/api/settings/base_library_path", json={"value": str(temp_vault)})
    
    resp = await client.post("/api/creators/", json={"canonical_name": "Test Artist"})
    creator_id = resp.json()["id"]
    
    resp = await client.post("/api/sets/", json={
        "title": "Test Set",
        "creator_ids": [creator_id]
    })
    set_id = resp.json()["id"]
    set_path = Path(resp.json()["local_path"])
    
    img_data = create_synthetic_saliency_image(width=1000, height=2000)
    img_path = set_path / "original.jpg"
    save_temp_image(img_data, img_path)
    
    resp = await client.post(f"/api/images/set/{set_id}", json={
        "filename": "original.jpg",
        "local_path": str(img_path)
    })
    image_id = resp.json()["id"]
    
    # Overwrite the original in place with custom coordinates
    resp = await client.post(f"/api/images/{image_id}/crop", json={
        "x": 200,
        "y": 200,
        "width": 600,
        "height": 400,
        "save_mode": "replace",
        "preview_only": False
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["image"] is not None
    updated_image = data["image"]
    assert updated_image["id"] == image_id
    assert updated_image["width"] == 600
    assert updated_image["height"] == 400
    
    # Check that original file on disk is replaced and updated
    assert os.path.exists(updated_image["local_path"])
    disk_img = cv2.imread(updated_image["local_path"])
    assert disk_img.shape[1] == 600
    assert disk_img.shape[0] == 400
