import pytest
from httpx import AsyncClient
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.playlist import Playlist

@pytest.fixture
async def sample_playlist(db_session: AsyncSession):
    pl = Playlist(name="Test Playlist", description="For rotation rules tests")
    db_session.add(pl)
    await db_session.commit()
    await db_session.refresh(pl)
    return pl

@pytest.mark.asyncio
async def test_rotation_rule_crud_endpoints(client: AsyncClient, sample_playlist):
    # 1. Get empty rules
    resp = await client.get("/api/rotation-rules/")
    assert resp.status_code == 200
    assert resp.json() == []

    # 2. Create rotation rule
    resp = await client.post("/api/rotation-rules/", json={
        "name": "Night Mode",
        "priority": 10,
        "enabled": 1,
        "start_time": "18:00",
        "end_time": "06:00",
        "source": "playlist",
        "playlist_id": sample_playlist.id,
        "style": "fill"
    })
    assert resp.status_code == 201
    rule = resp.json()
    assert rule["name"] == "Night Mode"
    assert rule["priority"] == 10
    assert rule["enabled"] == 1
    assert rule["start_time"] == "18:00"
    assert rule["end_time"] == "06:00"
    assert rule["source"] == "playlist"
    assert rule["playlist_id"] == sample_playlist.id
    assert rule["style"] == "fill"
    rule_id = rule["id"]

    # 3. Get rules list
    resp = await client.get("/api/rotation-rules/")
    assert resp.status_code == 200
    rules = resp.json()
    assert len(rules) == 1
    assert rules[0]["name"] == "Night Mode"

    # 4. Update rotation rule
    resp = await client.put(f"/api/rotation-rules/{rule_id}", json={
        "name": "Midnight Mode",
        "priority": 15
    })
    assert resp.status_code == 200
    rule_updated = resp.json()
    assert rule_updated["name"] == "Midnight Mode"
    assert rule_updated["priority"] == 15

    # 5. Delete rotation rule
    resp = await client.delete(f"/api/rotation-rules/{rule_id}")
    assert resp.status_code == 204

    # 6. Verify deleted
    resp = await client.get("/api/rotation-rules/")
    assert resp.status_code == 200
    assert resp.json() == []

@pytest.mark.asyncio
async def test_active_rule_evaluation(client: AsyncClient, sample_playlist):
    now = datetime.now()
    
    # 1. Create a disabled high-priority rule (should be ignored)
    resp = await client.post("/api/rotation-rules/", json={
        "name": "Disabled Rule",
        "priority": 100,
        "enabled": 0,
        "source": "entire_library"
    })
    assert resp.status_code == 201

    # 2. Create an enabled rule that matches (all conditions NULL)
    resp = await client.post("/api/rotation-rules/", json={
        "name": "Always Matching Rule",
        "priority": 10,
        "enabled": 1,
        "source": "entire_library"
    })
    assert resp.status_code == 201

    # 3. Create an enabled rule with days_of_week that doesn't match
    # Calculate an invalid day (not today)
    today_iso = now.isoweekday()
    not_today = 1 if today_iso != 1 else 2
    resp = await client.post("/api/rotation-rules/", json={
        "name": "Non-Matching Day Rule",
        "priority": 20,
        "enabled": 1,
        "days_of_week": str(not_today),
        "source": "playlist",
        "playlist_id": sample_playlist.id
    })
    assert resp.status_code == 201

    # 4. Get active rule (should return "Always Matching Rule" since it has priority 10 and matches, while priority 20 doesn't match, and priority 100 is disabled)
    resp = await client.get("/api/rotation-rules/active")
    assert resp.status_code == 200
    active = resp.json()
    assert active is not None
    assert active["name"] == "Always Matching Rule"

    # 5. Add a matching rule with higher priority (priority 30)
    # Using start_date and end_date encompassing today's month-day
    curr_md = now.strftime("%m-%d")
    resp = await client.post("/api/rotation-rules/", json={
        "name": "High Priority Date Match Rule",
        "priority": 30,
        "enabled": 1,
        "start_date": curr_md,
        "end_date": curr_md,
        "source": "playlist",
        "playlist_id": sample_playlist.id
    })
    assert resp.status_code == 201

    resp = await client.get("/api/rotation-rules/active")
    assert resp.status_code == 200
    active = resp.json()
    assert active is not None
    assert active["name"] == "High Priority Date Match Rule"
