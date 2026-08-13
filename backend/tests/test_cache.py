"""
Unit and integration tests for Cache Service and Settings Cache API endpoints.
"""
from pathlib import Path
from unittest.mock import patch
import pytest
from httpx import AsyncClient
from app.services.cache_service import (
    format_bytes,
    get_ai_models_cache_stats,
    check_model_status,
    download_model,
    clear_ai_models_cache,
    get_thumbnail_cache_stats,
    clear_thumbnail_cache,
    get_all_cache_stats,
)


def test_format_bytes():
    assert format_bytes(0) == "0 B"
    assert format_bytes(512) == "512 B"
    assert format_bytes(1024) == "1.00 KB"
    assert format_bytes(1024 * 1024 * 50) == "50.00 MB"
    assert format_bytes(1024 * 1024 * 1024 * 2) == "2.00 GB"


def test_ai_models_cache_stats(tmp_path: Path):
    with patch("app.services.cache_service.get_app_models_dir", return_value=tmp_path):
        # Empty directory
        stats = get_ai_models_cache_stats()
        assert stats.total_bytes == 0
        assert stats.model_count == 0
        assert len(stats.models) == 0

        # Create mock model directory
        model_dir = tmp_path / "models--SmilingWolf--wd-eva02-large-tagger-v3"
        snapshots_dir = model_dir / "snapshots" / "abc12345"
        snapshots_dir.mkdir(parents=True)
        model_file = snapshots_dir / "model.onnx"
        model_file.write_bytes(b"x" * 1024 * 100) # 100 KB
        csv_file = snapshots_dir / "selected_tags.csv"
        csv_file.write_bytes(b"y" * 1024 * 10) # 10 KB

        stats = get_ai_models_cache_stats()
        assert stats.model_count == 1
        assert stats.models[0].name == "SmilingWolf/wd-eva02-large-tagger-v3"
        assert stats.total_bytes == 1024 * 110


def test_check_model_status(tmp_path: Path):
    with patch("app.services.ai_tagging.get_app_models_dir", return_value=tmp_path):
        # Not cached initially
        resp = check_model_status("predefined", "wd_eva02_large_v3")
        assert resp.is_cached is False
        assert resp.model_name == "SmilingWolf/wd-eva02-large-tagger-v3"

        # Create mock cached files
        model_dir = tmp_path / "models--SmilingWolf--wd-eva02-large-tagger-v3" / "snapshots" / "hash1"
        model_dir.mkdir(parents=True)
        (model_dir / "model.onnx").write_bytes(b"mock onnx")
        (model_dir / "selected_tags.csv").write_bytes(b"mock csv")

        resp = check_model_status("predefined", "wd_eva02_large_v3")
        assert resp.is_cached is True
        assert resp.size_bytes > 0


def test_download_model():
    with patch("app.services.cache_service.download_model_files") as mock_download:
        mock_download.return_value = ("/path/model.onnx", "/path/selected_tags.csv", 1024 * 1024 * 500)
        resp = download_model("predefined", "wd_eva02_large_v3")
        assert resp.success is True
        assert resp.size_bytes == 1024 * 1024 * 500
        assert resp.human_size == "500.00 MB"


def test_clear_ai_models_cache(tmp_path: Path):
    with patch("app.services.cache_service.get_app_models_dir", return_value=tmp_path), \
         patch("app.services.cache_service.clear_tagger_instances") as mock_clear_instances:
        model_dir = tmp_path / "models--SmilingWolf--wd-eva02-large-tagger-v3"
        model_dir.mkdir(parents=True)
        (model_dir / "test.bin").write_bytes(b"12345678")

        resp = clear_ai_models_cache()
        assert resp.freed_bytes == 8
        assert mock_clear_instances.called
        assert not model_dir.exists()


def test_thumbnail_cache_stats_and_clear(tmp_path: Path):
    with patch("app.services.cache_service.THUMBS_DIR", tmp_path):
        # Empty
        stats = get_thumbnail_cache_stats()
        assert stats.file_count == 0
        assert stats.total_bytes == 0

        # Create mock thumbnails
        (tmp_path / "1_sm.jpg").write_bytes(b"a" * 100)
        (tmp_path / "1_md.jpg").write_bytes(b"b" * 200)

        stats = get_thumbnail_cache_stats()
        assert stats.file_count == 2
        assert stats.total_bytes == 300

        # Clear
        resp = clear_thumbnail_cache()
        assert resp.freed_bytes == 300
        assert len(list(tmp_path.iterdir())) == 0


def test_get_all_cache_stats(tmp_path: Path):
    with patch("app.services.cache_service.get_app_models_dir", return_value=tmp_path / "models"), \
         patch("app.services.cache_service.THUMBS_DIR", tmp_path / "thumbs"):
        stats = get_all_cache_stats()
        assert stats.ai_models.total_bytes == 0
        assert stats.thumbnails.total_bytes == 0


@pytest.mark.asyncio
async def test_cache_api_endpoints(client: AsyncClient, tmp_path: Path):
    # GET /api/settings/cache
    with patch("app.services.cache_service.get_app_models_dir", return_value=tmp_path / "models"), \
         patch("app.services.cache_service.THUMBS_DIR", tmp_path / "thumbs"):
        resp = await client.get("/api/settings/cache")
        assert resp.status_code == 200
        data = resp.json()
        assert "ai_models" in data
        assert "thumbnails" in data

    # POST /api/settings/cache/ai-models/status
    with patch("app.services.ai_tagging.get_app_models_dir", return_value=tmp_path / "models"):
        resp = await client.post(
            "/api/settings/cache/ai-models/status",
            json={"model_source": "predefined", "model_type": "wd_eva02_large_v3"}
        )
        assert resp.status_code == 200
        assert resp.json()["is_cached"] is False

    # POST /api/settings/cache/ai-models/download
    with patch("app.services.cache_service.download_model_files") as mock_download:
        mock_download.return_value = ("/p/model.onnx", "/p/selected_tags.csv", 1024)
        resp = await client.post(
            "/api/settings/cache/ai-models/download",
            json={"model_source": "predefined", "model_type": "wd_eva02_large_v3"}
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    # DELETE /api/settings/cache/ai-models
    with patch("app.services.cache_service.get_app_models_dir", return_value=tmp_path / "models"), \
         patch("app.services.cache_service.clear_tagger_instances"):
        resp = await client.delete("/api/settings/cache/ai-models")
        assert resp.status_code == 200
        assert "freed_bytes" in resp.json()

    # DELETE /api/settings/cache/thumbnails
    with patch("app.services.cache_service.THUMBS_DIR", tmp_path / "thumbs"):
        resp = await client.delete("/api/settings/cache/thumbnails")
        assert resp.status_code == 200
        assert "freed_bytes" in resp.json()
