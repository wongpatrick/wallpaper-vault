import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
import tempfile
import shutil
from pathlib import Path
import cv2
import numpy as np
from app.services import import_service
from app.models.image import Image as ImageModel
from app.models.set import Set as SetModel
from sqlalchemy import select

@pytest.fixture
def mock_images_dir():
    with tempfile.TemporaryDirectory() as tmpdir:
        base = Path(tmpdir)
        # Create a few mock image files
        img1 = np.zeros((100, 100, 3), dtype=np.uint8)
        # Draw some circles to give them unique phashes
        cv2.circle(img1, (50, 50), 20, (255, 255, 255), -1)
        cv2.imwrite(str(base / "img1.png"), img1)
        
        img2 = np.zeros((100, 100, 3), dtype=np.uint8)
        cv2.circle(img2, (30, 30), 10, (255, 255, 255), -1)
        cv2.imwrite(str(base / "img2.png"), img2)
        
        # Duplicate of img1
        cv2.imwrite(str(base / "img1_dup.png"), img1)
        
        yield base

@pytest.mark.asyncio
async def test_validate_import_paths(client: AsyncClient, mock_images_dir: Path, db_session: AsyncSession):
    """Test that validating local paths reports correct status and duplicate information."""
    
    p1 = mock_images_dir / "img1.png"
    p2 = mock_images_dir / "img2.png"
    
    # Verify validation on clean files (no duplicates yet)
    payload = {
        "local_paths": [str(p1), str(p2)]
    }
    
    resp = await client.post("/api/images/import/validate", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 2
    assert data["items"][0]["is_valid"] is True
    assert data["items"][0]["is_duplicate"] is False
    assert data["items"][1]["is_valid"] is True
    assert data["items"][1]["is_duplicate"] is False

@pytest.mark.asyncio
async def test_images_import_and_duplicate_detection(client: AsyncClient, mock_images_dir: Path, db_session: AsyncSession):
    """Test full flow: importing images and then verifying duplicate validation detects them."""
    
    # 1. Setup base library path settings
    with tempfile.TemporaryDirectory() as vault_dir:
        await client.put("/api/settings/base_library_path", json={"value": vault_dir})
        
        p1 = mock_images_dir / "img1.png"
        p2 = mock_images_dir / "img2.png"
        p1_dup = mock_images_dir / "img1_dup.png"
        
        # Create a background task ID to run import synchronously
        from app.core import tasks
        task_id = await tasks.create_task(db_session=db_session, status="accepted", prefix="import")
        
        import_req = {
            "items": [
                {"local_path": str(p1), "filename": "img1.png"},
                {"local_path": str(p2), "filename": "img2.png"}
            ],
            "creator_name": "Test Artist",
            "set_title": "First Import Set",
            "tags": ["wallpaper", "art"],
            "rating": "safe",
            "delete_source": False
        }
        
        # Run background import logic synchronously for testing
        await import_service.import_images_background_task(
            db=db_session,
            request_data=import_req,
            task_id=task_id
        )
        
        # Verify images and set exist in DB
        res = await db_session.execute(select(ImageModel))
        images = res.scalars().all()
        assert len(images) == 2
        assert any(img.filename.endswith("img1.png") for img in images)
        
        res_set = await db_session.execute(select(SetModel).where(SetModel.title == "First Import Set"))
        imported_set = res_set.scalars().first()
        assert imported_set is not None
        assert len(imported_set.images) == 2
        
        # 2. Test validating a duplicate file path
        payload = {
            "local_paths": [str(p1_dup)]
        }
        resp = await client.post("/api/images/import/validate", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 1
        item = data["items"][0]
        assert item["is_valid"] is True
        assert item["is_duplicate"] is True
        assert item["existing_set_title"] == "First Import Set"
        assert "Test Artist" in item["existing_creator_names"]


@pytest.mark.asyncio
async def test_images_import_delete_source(client: AsyncClient, mock_images_dir: Path, db_session: AsyncSession):
    """Test that delete_source option deletes the source files after a successful import."""
    with tempfile.TemporaryDirectory() as vault_dir:
        await client.put("/api/settings/base_library_path", json={"value": vault_dir})
        
        # Copy mock images to a temp location so we can delete them
        temp_src_dir = Path(vault_dir) / "temp_sources"
        temp_src_dir.mkdir()
        
        p1 = temp_src_dir / "img1_to_del.png"
        p2 = temp_src_dir / "img2_to_del.png"
        shutil.copy(mock_images_dir / "img1.png", p1)
        shutil.copy(mock_images_dir / "img2.png", p2)
        
        assert p1.exists()
        assert p2.exists()
        
        from app.core import tasks
        task_id = await tasks.create_task(db_session=db_session, status="accepted", prefix="import")
        
        import_req = {
            "items": [
                {"local_path": str(p1), "filename": "img1_to_del.png"},
                {"local_path": str(p2), "filename": "img2_to_del.png"}
            ],
            "creator_name": "Test Artist",
            "set_title": "Delete Set",
            "tags": ["wallpaper"],
            "rating": "safe",
            "delete_source": True
        }
        
        await import_service.import_images_background_task(
            db=db_session,
            request_data=import_req,
            task_id=task_id
        )
        
        # Verify that they were imported successfully
        res = await db_session.execute(select(ImageModel))
        images = res.scalars().all()
        assert len(images) == 2
        
        # Verify that source files were deleted
        assert not p1.exists()
        assert not p2.exists()


def test_delete_dir_if_empty_recursive():
    """Test delete_dir_if_empty recursively deletes empty dirs and ignored files."""
    from app.services.import_service import delete_dir_if_empty
    
    with tempfile.TemporaryDirectory() as tmpdir:
        base = Path(tmpdir)
        
        # Scenario 1: Subdirectories are empty
        sub_empty = base / "sub_empty"
        sub_empty.mkdir()
        
        # Scenario 2: Subdirectory contains only ignored files
        sub_ignored = base / "sub_ignored"
        sub_ignored.mkdir()
        (sub_ignored / "Thumbs.db").touch()
        (sub_ignored / ".DS_Store").touch()
        
        # Scenario 3: Subdirectory contains non-ignored user files (should NOT be deleted)
        sub_user_files = base / "sub_user_files"
        sub_user_files.mkdir()
        (sub_user_files / "readme.txt").touch()
        
        # Run deletion on base
        # It shouldn't delete base completely because sub_user_files has readme.txt
        delete_dir_if_empty(base)
        
        assert not sub_empty.exists()
        assert not sub_ignored.exists()
        assert sub_user_files.exists()
        assert (sub_user_files / "readme.txt").exists()
        assert base.exists()
        
        # If we delete readme.txt, then it should delete all of them
        (sub_user_files / "readme.txt").unlink()
        delete_dir_if_empty(base)
        
        assert not sub_user_files.exists()
        assert not base.exists()


@pytest.mark.asyncio
async def test_images_import_delete_source_directory(client: AsyncClient, mock_images_dir: Path, db_session: AsyncSession):
    """Test that delete_source option deletes the source directory if it contains only imported files."""
    with tempfile.TemporaryDirectory() as vault_dir:
        await client.put("/api/settings/base_library_path", json={"value": vault_dir})
        
        temp_src_dir = Path(vault_dir) / "temp_sources_dir"
        temp_src_dir.mkdir()
        
        p1 = temp_src_dir / "img1_to_del.png"
        p2 = temp_src_dir / "img2_to_del.png"
        shutil.copy(mock_images_dir / "img1.png", p1)
        shutil.copy(mock_images_dir / "img2.png", p2)
        
        assert temp_src_dir.exists()
        assert p1.exists()
        assert p2.exists()
        
        from app.core import tasks
        task_id = await tasks.create_task(db_session=db_session, status="accepted", prefix="import")
        
        import_req = {
            "items": [
                {"local_path": str(temp_src_dir)}
            ],
            "creator_name": "Test Artist",
            "set_title": "Delete Set Dir",
            "tags": ["wallpaper"],
            "rating": "safe",
            "delete_source": True
        }
        
        await import_service.import_images_background_task(
            db=db_session,
            request_data=import_req,
            task_id=task_id
        )
        
        # Verify that they were imported successfully
        res = await db_session.execute(select(ImageModel))
        images = res.scalars().all()
        assert len(images) == 2
        
        # Verify that both files and the directory were deleted
        assert not p1.exists()
        assert not p2.exists()
        assert not temp_src_dir.exists()


