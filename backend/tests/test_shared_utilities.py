"""
Tests for newly extracted shared core utilities:
- aspect_ratio
- ai_config
- log_utils
- constants
- color_utils
"""
import pytest
from app.core.aspect_ratio import parse_ratio, get_aspect_ratio_labels
from app.core.log_utils import safe_log_val
from app.core.constants import THUMBNAIL_SIZES, PRESET_SWATCHES
from app.core.color_utils import hex_to_hsl, matches_color
from app.core.ai_config import load_ai_tagging_config, AiTaggingConfig


def test_parse_ratio():
    assert parse_ratio("16/9", 1.0) == pytest.approx(16.0 / 9.0)
    assert parse_ratio("9x16", 1.0) == pytest.approx(9.0 / 16.0)
    assert parse_ratio("1.5", 1.0) == pytest.approx(1.5)
    assert parse_ratio("16/0", 1.0) == 1.0
    assert parse_ratio("16x0", 1.0) == 1.0
    assert parse_ratio("invalid", 2.0) == 2.0
    assert parse_ratio("", 1.0) == 1.0


def test_safe_log_val():
    assert safe_log_val("hello world") == "hello world"
    assert safe_log_val("unicode_test_😊") == "unicode_test_\\U0001f60a"
    assert safe_log_val(["a", "b"]) == ["a", "b"]
    assert safe_log_val({"k": "v"}) == {"k": "v"}


def test_constants():
    assert THUMBNAIL_SIZES == ("sm", "md", "lg")
    assert "#E03131" in PRESET_SWATCHES
    assert len(PRESET_SWATCHES) == 11


def test_color_utils():
    # Hex conversion
    h, s, light = hex_to_hsl("#FF0000")
    assert h == pytest.approx(0.0)
    assert s == pytest.approx(100.0)
    assert light == pytest.approx(50.0)

    # Invalid hex string
    assert hex_to_hsl("#ZZZZZZ") == (0.0, 0.0, 0.0)
    assert hex_to_hsl("#123") == (0.0, 0.0, 0.0)

    # Color matching
    assert matches_color("#FF0000", "red") is True
    assert matches_color("#0000FF", "blue") is True
    assert matches_color("#FFFFFF", "white") is True
    assert matches_color("#000000", "black") is True
    assert matches_color(None, "red") is False
    assert matches_color("#FF0000", "invalid_color_bucket") is False


@pytest.mark.anyio
async def test_get_aspect_ratio_labels(db_session):
    h_label, v_label = await get_aspect_ratio_labels(db_session)
    assert isinstance(h_label, str)
    assert isinstance(v_label, str)
    assert "x" in h_label or "/" not in h_label


@pytest.mark.anyio
async def test_load_ai_tagging_config(db_session):
    cfg = await load_ai_tagging_config(db_session, init_tagger=False)
    assert isinstance(cfg, AiTaggingConfig)
    assert isinstance(cfg.enabled, bool)
    assert isinstance(cfg.confidence_threshold, float)
    data = cfg.to_dict()
    assert "enabled" in data
    assert "confidence_threshold" in data
