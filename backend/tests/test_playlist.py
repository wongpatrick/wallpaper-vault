import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.set import Set
from app.models.image import Image
from app.core.enums import ImageRating

@pytest.fixture
async def sample_data(db_session: AsyncSession):
    """Fixture to create a sample set and some images in the database."""
    db_set = Set(title="Test Set", local_path="C:/vault/test_set")
    db_session.add(db_set)
    await db_session.flush()

    img1 = Image(
        set_id=db_set.id,
        filename="img1.jpg",
        local_path="C:/vault/test_set/img1.jpg",
        width=1920,
        height=1080,
        aspect_ratio_label="16:9",
        rating=ImageRating.SAFE
    )
    img2 = Image(
        set_id=db_set.id,
        filename="img2.jpg",
        local_path="C:/vault/test_set/img2.jpg",
        width=1920,
        height=1080,
        aspect_ratio_label="16:9",
        rating=ImageRating.SAFE
    )
    img3 = Image(
        set_id=db_set.id,
        filename="img3.jpg",
        local_path="C:/vault/test_set/img3.jpg",
        width=1000,
        height=1000,
        aspect_ratio_label="1:1",
        rating=ImageRating.EXPLICIT
    )
    db_session.add_all([img1, img2, img3])
    await db_session.commit()
    return {"set_id": db_set.id, "images": [img1, img2, img3]}

@pytest.mark.asyncio
async def test_playlist_crud_endpoints(client: AsyncClient, sample_data):
    # 1. Get empty playlists
    resp = await client.get("/api/playlists")
    assert resp.status_code == 200
    assert resp.json() == []

    # 2. Create playlist
    resp = await client.post("/api/playlists", json={
        "name": "My Moods",
        "description": "Custom playlist"
    })
    assert resp.status_code == 200
    playlist = resp.json()
    assert playlist["name"] == "My Moods"
    assert playlist["description"] == "Custom playlist"
    assert playlist["image_count"] == 0
    playlist_id = playlist["id"]

    # 3. Create duplicate playlist (should fail)
    resp = await client.post("/api/playlists", json={
        "name": "My Moods",
        "description": "Another description"
    })
    assert resp.status_code == 400
    assert "already exists" in resp.json()["detail"]

    # 4. Get playlists list
    resp = await client.get("/api/playlists")
    assert resp.status_code == 200
    playlists = resp.json()
    assert len(playlists) == 1
    assert playlists[0]["name"] == "My Moods"

    # 5. Update playlist
    resp = await client.put(f"/api/playlists/{playlist_id}", json={
        "name": "Updated Moods",
        "description": "New description"
    })
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Moods"
    assert resp.json()["description"] == "New description"

    # 6. Delete playlist
    resp = await client.delete(f"/api/playlists/{playlist_id}")
    assert resp.status_code == 200
    
    resp = await client.get("/api/playlists")
    assert resp.status_code == 200
    assert resp.json() == []

@pytest.mark.asyncio
async def test_playlist_image_operations(client: AsyncClient, sample_data):
    images = sample_data["images"]
    img1_id = images[0].id
    img2_id = images[1].id
    img3_id = images[2].id

    # Create playlist
    resp = await client.post("/api/playlists", json={"name": "Favs"})
    playlist_id = resp.json()["id"]

    # Add images
    resp = await client.post(f"/api/playlists/{playlist_id}/images", json={
        "image_ids": [img1_id, img2_id]
    })
    assert resp.status_code == 200
    assert resp.json()["added_count"] == 2

    # Add same images again (should be rejected/no-op due to uniqueness)
    resp = await client.post(f"/api/playlists/{playlist_id}/images", json={
        "image_ids": [img1_id, img3_id]
    })
    assert resp.status_code == 200
    # only img3 was new
    assert resp.json()["added_count"] == 1

    # Get details
    resp = await client.get(f"/api/playlists/{playlist_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["image_count"] == 3
    assert len(data["images"]) == 3
    # Check default sort order (img1, img2, img3)
    assert data["images"][0]["image"]["id"] == img1_id
    assert data["images"][0]["sort_order"] == 1
    assert data["images"][1]["image"]["id"] == img2_id
    assert data["images"][1]["sort_order"] == 2
    assert data["images"][2]["image"]["id"] == img3_id
    assert data["images"][2]["sort_order"] == 3

    # Reorder images to [img2_id, img1_id, img3_id]
    resp = await client.put(f"/api/playlists/{playlist_id}/images/reorder", json={
        "image_ids": [img2_id, img1_id, img3_id]
    })
    assert resp.status_code == 200

    # Get details and verify order
    resp = await client.get(f"/api/playlists/{playlist_id}")
    data = resp.json()
    assert data["images"][0]["image"]["id"] == img2_id
    assert data["images"][0]["sort_order"] == 0
    assert data["images"][1]["image"]["id"] == img1_id
    assert data["images"][1]["sort_order"] == 1
    assert data["images"][2]["image"]["id"] == img3_id
    assert data["images"][2]["sort_order"] == 2

    # Remove image
    resp = await client.request(
        "DELETE",
        f"/api/playlists/{playlist_id}/images",
        json={"image_ids": [img1_id]}
    )
    assert resp.status_code == 200
    assert resp.json()["removed_count"] == 1

    # Get details and verify removed
    resp = await client.get(f"/api/playlists/{playlist_id}")
    data = resp.json()
    assert data["image_count"] == 2
    assert [x["image"]["id"] for x in data["images"]] == [img2_id, img3_id]

@pytest.mark.asyncio
async def test_playlist_random_endpoints(client: AsyncClient, sample_data):
    images = sample_data["images"]
    img1_id = images[0].id
    img3_id = images[2].id

    # Create playlist
    resp = await client.post("/api/playlists", json={"name": "Random Rotation"})
    playlist_id = resp.json()["id"]

    # Try random endpoint on empty playlist (should return 404)
    resp = await client.get(f"/api/playlists/{playlist_id}/random")
    assert resp.status_code == 404

    # Add safe image and explicit image to playlist
    await client.post(f"/api/playlists/{playlist_id}/images", json={
        "image_ids": [img1_id, img3_id]
    })

    # Get random image
    resp = await client.get(f"/api/playlists/{playlist_id}/random")
    assert resp.status_code == 200
    assert resp.json()["id"] in [img1_id, img3_id]

    # Get random image with filter rating=safe
    resp = await client.get(f"/api/playlists/{playlist_id}/random?rating=safe")
    assert resp.status_code == 200
    assert resp.json()["id"] == img1_id

    # Get random image with filter aspect_ratio_label=1:1
    resp = await client.get(f"/api/playlists/{playlist_id}/random?aspect_ratio_label=1:1")
    assert resp.status_code == 200
    assert resp.json()["id"] == img3_id

    # Get random image via global random endpoint filtering by playlist_id
    resp = await client.get(f"/api/images/random?playlist_id={playlist_id}&rating=safe")
    assert resp.status_code == 200
    assert resp.json()["id"] == img1_id

    # Test path-based random file endpoint (exists in DB, missing on disk)
    resp = await client.get(f"/api/playlists/{playlist_id}/random/file/16:9/image.jpg")
    assert resp.status_code == 404
    assert "Image file not found on disk" in resp.json()["detail"]

    # Test robust aspect ratio matching in path (16x9 matches 16:9 image, missing on disk)
    resp = await client.get(f"/api/playlists/{playlist_id}/random/file/16x9/image.jpg")
    assert resp.status_code == 404
    assert "Image file not found on disk" in resp.json()["detail"]

    # Test robust aspect ratio matching via query parameters (16x9 matches 16:9)
    resp = await client.get(f"/api/playlists/{playlist_id}/random?aspect_ratio_label=16x9")
    assert resp.status_code == 200
    assert resp.json()["id"] == img1_id

    # Test robust aspect ratio matching via query parameters (16/9 matches 16:9)
    resp = await client.get(f"/api/playlists/{playlist_id}/random?aspect_ratio_label=16/9")
    assert resp.status_code == 200
    assert resp.json()["id"] == img1_id

    # Test path-based random file endpoint (no match in DB)
    resp = await client.get(f"/api/playlists/{playlist_id}/random/file/21:9/image.jpg")
    assert resp.status_code == 404
    assert "No images found matching criteria" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_smart_playlist_endpoints(client: AsyncClient, sample_data, db_session: AsyncSession):
    images = sample_data["images"]
    img1_id = images[0].id
    img2_id = images[1].id

    # Mark img1_id as favorite to test favorite filter
    from app.models.image import Image as DBImage
    from sqlalchemy import update
    await db_session.execute(update(DBImage).where(DBImage.id == img1_id).values(is_favorite=True))
    await db_session.commit()

    # 1. Create a smart playlist targeting favorites with safe rating
    resp = await client.post("/api/playlists", json={
        "name": "Smart Favorites",
        "description": "Dynamic favorites playlist",
        "is_smart": True,
        "rules": {
            "is_favorite": True,
            "ratings": ["safe"],
            "sort_by": "date_added",
            "sort_dir": "desc"
        }
    })
    assert resp.status_code == 200
    playlist = resp.json()
    assert playlist["is_smart"] is True
    assert playlist["rules"]["is_favorite"] is True
    assert playlist["image_count"] == 1
    playlist_id = playlist["id"]

    # 2. Get smart playlist details (should fetch dynamic images list AND return is_smart/rules)
    resp = await client.get(f"/api/playlists/{playlist_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_smart"] is True
    assert data["rules"]["is_favorite"] is True
    assert data["rules"]["ratings"] == ["safe"]
    assert data["image_count"] == 1
    assert len(data["images"]) == 1
    assert data["images"][0]["image"]["id"] == img1_id

    # 3. Block manual operations (should fail with 400)
    resp = await client.post(f"/api/playlists/{playlist_id}/images", json={
        "image_ids": [img2_id]
    })
    assert resp.status_code == 400
    assert "Cannot manually add images" in resp.json()["detail"]

    resp = await client.request(
        "DELETE",
        f"/api/playlists/{playlist_id}/images",
        json={"image_ids": [img1_id]}
    )
    assert resp.status_code == 400
    assert "Cannot manually remove images" in resp.json()["detail"]

    resp = await client.put(f"/api/playlists/{playlist_id}/images/reorder", json={
        "image_ids": [img1_id]
    })
    assert resp.status_code == 400
    assert "Cannot manually reorder" in resp.json()["detail"]

    # 4. Get random image from smart playlist
    resp = await client.get(f"/api/playlists/{playlist_id}/random")
    assert resp.status_code == 200
    assert resp.json()["id"] == img1_id
