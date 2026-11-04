import json
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings_validation import validate_rotation_setting
from app.models.rotation_profile import RotationProfile
from app.models.settings import Setting


def test_validate_rotation_setting_unit():
    # Valid global values
    validate_rotation_setting("wallpaper_rotation_mode", "displayfusion")
    validate_rotation_setting("wallpaper_rotation_mode", "native")
    validate_rotation_setting("wallpaper_rotation_mode", " DisplayFusion ")
    validate_rotation_setting("wallpaper_rotation_mode", "NATIVE")

    # Valid per-monitor values
    validate_rotation_setting("monitor_0_wallpaper_rotation_mode", "displayfusion")
    validate_rotation_setting("monitor_2_wallpaper_rotation_mode", "native")

    # Unrelated keys should pass without error
    validate_rotation_setting("wallpaper_rotation_interval", "30")
    validate_rotation_setting("wallpaper_rotation_style", "fill")
    validate_rotation_setting("custom_arbitrary_key", "anything")

    # Invalid values must raise ValueError
    with pytest.raises(ValueError, match="Invalid rotation mode"):
        validate_rotation_setting("wallpaper_rotation_mode", "invalid_mode")

    with pytest.raises(ValueError, match="Invalid rotation mode"):
        validate_rotation_setting("monitor_1_wallpaper_rotation_mode", "unknown")

    with pytest.raises(ValueError, match="Invalid rotation mode"):
        validate_rotation_setting("wallpaper_rotation_mode", "")


@pytest.mark.asyncio
async def test_settings_api_rotation_mode_validation(client: AsyncClient):
    # Valid global update
    resp = await client.put(
        "/api/settings/wallpaper_rotation_mode",
        json={"value": "displayfusion", "description": "Global mode"},
    )
    assert resp.status_code == 200
    assert resp.json()["value"] == "displayfusion"

    resp = await client.put(
        "/api/settings/wallpaper_rotation_mode",
        json={"value": "native", "description": "Global mode"},
    )
    assert resp.status_code == 200
    assert resp.json()["value"] == "native"

    # Invalid global update -> 422
    resp = await client.put(
        "/api/settings/wallpaper_rotation_mode",
        json={"value": "bogus_mode", "description": "Global mode"},
    )
    assert resp.status_code == 422
    assert "Invalid rotation mode" in resp.json()["detail"]

    # Valid per-monitor update
    resp = await client.put(
        "/api/settings/monitor_0_wallpaper_rotation_mode",
        json={"value": "displayfusion", "description": "Monitor 0 mode"},
    )
    assert resp.status_code == 200
    assert resp.json()["value"] == "displayfusion"

    # Invalid per-monitor update -> 422
    resp = await client.put(
        "/api/settings/monitor_0_wallpaper_rotation_mode",
        json={"value": "unsupported", "description": "Monitor 0 mode"},
    )
    assert resp.status_code == 422
    assert "Invalid rotation mode" in resp.json()["detail"]

    # Unrelated setting update should succeed normally
    resp = await client.put(
        "/api/settings/wallpaper_rotation_interval",
        json={"value": "20", "description": "Interval"},
    )
    assert resp.status_code == 200
    assert resp.json()["value"] == "20"


@pytest.mark.asyncio
async def test_apply_profile_skips_invalid_rotation_mode(
    client: AsyncClient,
    db_session: AsyncSession,
):
    # Create an initial valid setting
    db_setting = Setting(
        key="wallpaper_rotation_mode",
        value="native",
        description="Initial mode",
    )
    db_session.add(db_setting)

    # Create a profile that contains an invalid rotation mode alongside a valid setting
    corrupted_config = {
        "wallpaper_rotation_interval": "45",
        "wallpaper_rotation_mode": "corrupted_mode_value",
    }
    profile = RotationProfile(
        name="Corrupted Profile",
        config_json=json.dumps(corrupted_config),
    )
    db_session.add(profile)
    await db_session.commit()
    await db_session.refresh(profile)

    # Applying the profile should succeed (200) without crashing
    resp = await client.post(f"/api/rotation-profiles/{profile.id}/apply")
    assert resp.status_code == 200

    # The valid interval setting was applied
    interval_resp = await client.get("/api/settings/wallpaper_rotation_interval")
    assert interval_resp.status_code == 200
    assert interval_resp.json()["value"] == "45"

    # The invalid rotation mode was skipped and remains the previous value
    mode_resp = await client.get("/api/settings/wallpaper_rotation_mode")
    assert mode_resp.status_code == 200
    assert mode_resp.json()["value"] == "native"
