import pytest
from httpx import AsyncClient
from app.models.image import Image
from app.models.set import Set
from sqlalchemy.ext.asyncio import AsyncSession

@pytest.mark.asyncio
async def test_set_active_wallpaper_endpoint(client: AsyncClient, db_session: AsyncSession):
    # 1. Create a Set and Image in DB
    new_set = Set(title="Test Set For Wallpaper", local_path="/mock/path")
    db_session.add(new_set)
    await db_session.flush()

    new_img = Image(
        filename="test_wallpaper.jpg",
        local_path="/mock/path/test_wallpaper.jpg",
        set_id=new_set.id,
        aspect_ratio_label="16:9"
    )
    db_session.add(new_img)
    await db_session.commit()

    # 2. Test 404 on non-existent image
    res_404 = await client.post("/api/rotation-history/set-wallpaper", json={
        "image_id": 999999,
        "target_monitor": "all",
        "style": "fill"
    })
    assert res_404.status_code == 404

    # 3. Test setting active wallpaper for Monitor 0 with 'fit' style
    res_monitor = await client.post("/api/rotation-history/set-wallpaper", json={
        "image_id": new_img.id,
        "target_monitor": "0",
        "style": "fit"
    })
    assert res_monitor.status_code == 200
    data_monitor = res_monitor.json()
    assert data_monitor["status"] == "success"
    assert data_monitor["image_id"] == new_img.id
    assert data_monitor["target_monitor"] == "0"
    assert data_monitor["style"] == "fit"

    # Verify settings updated
    res_setting_monitor = await client.get("/api/settings/monitor_0_active_image_id")
    assert res_setting_monitor.status_code == 200
    assert res_setting_monitor.json()["value"] == str(new_img.id)

    res_setting_style = await client.get("/api/settings/monitor_0_wallpaper_rotation_style")
    assert res_setting_style.status_code == 200
    assert res_setting_style.json()["value"] == "fit"

    # 4. Test setting active wallpaper globally (all displays)
    res_global = await client.post("/api/rotation-history/set-wallpaper", json={
        "image_id": new_img.id,
        "target_monitor": "all",
        "style": "span"
    })
    assert res_global.status_code == 200
    data_global = res_global.json()
    assert data_global["status"] == "success"
    assert data_global["target_monitor"] == "all"
    assert data_global["style"] == "span"

    res_setting_global = await client.get("/api/settings/wallpaper_active_image_id")
    assert res_setting_global.status_code == 200
    assert res_setting_global.json()["value"] == str(new_img.id)

    # 5. Check /api/rotation-history/current-monitors reflects it
    res_monitors = await client.get("/api/rotation-history/current-monitors")
    assert res_monitors.status_code == 200
    monitors_data = res_monitors.json()
    assert "0" in monitors_data
    assert monitors_data["0"]["id"] == new_img.id
    assert "global" in monitors_data
    assert monitors_data["global"]["id"] == new_img.id

    # 6. Test default parameters (only image_id provided)
    res_defaults = await client.post("/api/rotation-history/set-wallpaper", json={
        "image_id": new_img.id
    })
    assert res_defaults.status_code == 200
    assert res_defaults.json()["target_monitor"] == "all"
    assert res_defaults.json()["style"] == "fill"

    # 7. Test invalid style validation (422)
    res_invalid_style = await client.post("/api/rotation-history/set-wallpaper", json={
        "image_id": new_img.id,
        "style": "invalid_style_name"
    })
    assert res_invalid_style.status_code == 422
