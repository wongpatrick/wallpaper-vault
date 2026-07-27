import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
import io

from app.services.import_service import (
    parse_and_validate_candidates,
    compile_parsing_regex
)


@pytest.mark.asyncio
async def test_unicode_folder_name_parsing(db_session: AsyncSession):
    """Verify folder parsing handles various Unicode dashes, spaces, and multi-artist delimiters."""
    candidates = [
        {"path": "/tmp/c1", "name": "柒柒要乖哦 - 雨天邂逅"},
        {"path": "/tmp/c2", "name": "Artist A – EnDash Set"},
        {"path": "/tmp/c3", "name": "Artist B — EmDash Set"},
        {"path": "/tmp/c4", "name": "Artist C－FullwidthHyphen Set"},
        {"path": "/tmp/c5", "name": "Artist 1 & Artist 2 - Joint Project"},
        {"path": "/tmp/c6", "name": "Artist X ＆ Artist Y - FullwidthAmp Set"},
        {"path": "/tmp/c7", "name": "Artist Alpha / Artist Beta - Slash Separated"},
        {"path": "/tmp/c8", "name": "Artist One, Artist Two - Comma Separated"},
    ]

    results = await parse_and_validate_candidates(db_session, candidates, regex=None)
    assert len(results) == 8

    # 1. Asian characters with standard dash
    assert results[0].creator_name == "柒柒要乖哦"
    assert results[0].set_title == "雨天邂逅"

    # 2. En-dash
    assert results[1].creator_name == "Artist A"
    assert results[1].set_title == "EnDash Set"

    # 3. Em-dash
    assert results[2].creator_name == "Artist B"
    assert results[2].set_title == "EmDash Set"

    # 4. Fullwidth hyphen
    assert results[3].creator_name == "Artist C"
    assert results[3].set_title == "FullwidthHyphen Set"

    # 5. Multi-artist with &
    assert results[4].creator_name == "Artist 1 & Artist 2"
    assert results[4].set_title == "Joint Project"

    # 6. Multi-artist with fullwidth &
    assert results[5].creator_name == "Artist X ＆ Artist Y"
    assert results[5].set_title == "FullwidthAmp Set"

    # 7. Multi-artist with slash
    assert results[6].creator_name == "Artist Alpha / Artist Beta"
    assert results[6].set_title == "Slash Separated"

    # 8. Multi-artist with comma
    assert results[7].creator_name == "Artist One, Artist Two"
    assert results[7].set_title == "Comma Separated"


@pytest.mark.asyncio
async def test_compile_parsing_regex_flexible_dashes():
    """Verify template regex compilation supports flexible Unicode dashes."""
    pattern = compile_parsing_regex("[Creator] - [Set]")
    assert pattern is not None

    m1 = pattern.match("柒柒要乖哦 - 雨天邂逅")
    assert m1 is not None
    groups1 = m1.groupdict()
    assert groups1.get("creator_0") == "柒柒要乖哦"
    assert groups1.get("set_0") == "雨天邂逅"

    m2 = pattern.match("Artist A – EnDash Set")
    assert m2 is not None
    groups2 = m2.groupdict()
    assert groups2.get("creator_0") == "Artist A"
    assert groups2.get("set_0") == "EnDash Set"


@pytest.mark.asyncio
async def test_upload_filename_path_traversal_sanitization(client: AsyncClient):
    """Verify that uploading files with path traversal payload filenames does not escape temp dir."""
    files = [
        ("files", ("../../../evil.png", io.BytesIO(b"fake image content"), "image/png")),
        ("files", ("..\\..\\win_evil.png", io.BytesIO(b"fake image content"), "image/png")),
        ("files", ("normal.png", io.BytesIO(b"fake image content"), "image/png")),
    ]

    resp = await client.post("/api/images/import/validate-files", files=files)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    
    # Check that paths returned by validation endpoint are safe and resolved
    for item in data["items"]:
        path_str = item["local_path"]
        assert ".." not in path_str
        assert "evil.png" in path_str or "win_evil.png" in path_str or "normal.png" in path_str
