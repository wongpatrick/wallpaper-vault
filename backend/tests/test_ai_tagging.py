import pytest
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from PIL import Image
import numpy as np

from app.models.image import Image as ImageModel
from app.models.set import Set
from app.models.tag import Tag
from app.models.settings import Setting
from app.services.import_service import execute_import_item
from app.schemas.set import BatchImportItem
from app.crud.settings import update_setting
from app.schemas.settings import SettingUpdate
from app.services.ai_tagging import WD14OnnxTagger, get_tagger

@pytest.fixture
def mock_import_set_dir():
    with tempfile.TemporaryDirectory() as tmpdir:
        base = Path(tmpdir)
        folder = base / "Test Creator - Anime Set"
        folder.mkdir()
        
        # Add 3 dummy images using Pillow
        for i in range(1, 4):
            img = Image.new("RGB", (100, 100), (0, 0, 0))
            img.save(folder / f"img{i}.jpg")
            
        yield folder

@pytest.mark.asyncio
async def test_image_tag_relationship(db_session: AsyncSession):
    """
    Test that the many-to-many relationship between Image and Tag works correctly.
    """
    # Create a set first (required for Image due to foreign key constraint)
    test_set = Set(title="Test Set", local_path="/dummy/path")
    db_session.add(test_set)
    await db_session.flush()

    tag1 = Tag(name="Anime")
    tag2 = Tag(name="Girl")
    db_session.add_all([tag1, tag2])
    await db_session.flush()

    # Create image with associated tags directly to avoid lazy load issue
    img = ImageModel(
        filename="test.jpg",
        local_path="/dummy/path/test.jpg",
        set_id=test_set.id,
        width=100,
        height=100,
        tags=[tag1, tag2]
    )
    
    db_session.add(img)
    await db_session.flush()

    # Clear session and query back
    await db_session.commit()
    
    # Query Image and eager load tags
    stmt = select(ImageModel).options(selectinload(ImageModel.tags)).filter(ImageModel.id == img.id)
    result = await db_session.execute(stmt)
    queried_img = result.scalars().first()
    
    assert len(queried_img.tags) == 2
    tag_names = {t.name for t in queried_img.tags}
    assert "Anime" in tag_names
    assert "Girl" in tag_names

    # Query Tag and eager load images
    stmt_tag = select(Tag).options(selectinload(Tag.images)).filter(Tag.name == "Anime")
    result_tag = await db_session.execute(stmt_tag)
    queried_tag = result_tag.scalars().first()
    assert len(queried_tag.images) == 1
    assert queried_tag.images[0].id == img.id

@pytest.mark.asyncio
@patch("app.services.ai_tagging.get_tagger")
async def test_ai_tagging_and_rollup(mock_get_tagger, db_session: AsyncSession, mock_import_set_dir: Path):
    """
    Test AI auto-tagging during import with a 30% dynamic rollup threshold.
    """
    # Set up settings
    await update_setting(db_session, "ai_auto_tag_enabled", SettingUpdate(value="true"))
    await update_setting(db_session, "ai_confidence_threshold", SettingUpdate(value="0.35"))
    await update_setting(db_session, "ai_rollup_threshold", SettingUpdate(value="0.30"))
    
    # Set up mock tagger output for 3 images (WD14OnnxTagger returns (general, character))
    mock_tagger = MagicMock()
    mock_tagger.tag_image.side_effect = [
        (["anime", "girl", "solo"], ["tokisaki kurumi"]),  # img1
        (["anime", "boy"], ["tokisaki kurumi"]),          # img2
        (["anime", "girl"], ["hatsune miku"])             # img3
    ]
    mock_get_tagger.return_value = mock_tagger

    import_item = BatchImportItem(
        source_path=str(mock_import_set_dir),
        creator_name="Test Creator",
        set_title="Anime Set",
        is_valid=True,
        status="pending"
    )

    with tempfile.TemporaryDirectory() as vault_dir:
        vault_root = Path(vault_dir)
        
        result_item = await execute_import_item(
            db=db_session,
            item=import_item,
            vault_root=vault_root,
            h_ratio=1.0,
            v_ratio=1.0,
            h_label="horiz",
            v_label="vert",
            delete_source_default=False
        )

        assert result_item.status == "success"
        await db_session.flush()

        # Check database records, eager loading images, tags, and characters
        stmt = (
            select(Set)
            .options(
                selectinload(Set.images).selectinload(ImageModel.tags),
                selectinload(Set.tags),
                selectinload(Set.characters)
            )
            .filter(Set.title == "Anime Set")
        )
        res = await db_session.execute(stmt)
        imported_set = res.scalars().first()
        assert imported_set is not None
        
        # Verify images were tagged
        assert len(imported_set.images) == 3
        # Fetch tags for each image
        img_tags = [sorted([t.name for t in img.tags]) for img in imported_set.images]
        assert ["Anime", "Girl", "Solo"] in img_tags
        assert ["Anime", "Boy"] in img_tags
        assert ["Anime", "Girl"] in img_tags

        # Verify dynamic rollup with 30% threshold (excludes characters)
        set_tag_names = {t.name for t in imported_set.tags}
        assert set_tag_names == {"Anime", "Girl", "Solo", "Boy"}

        # Verify characters were resolved and associated at the Set level (with Title Case)
        set_character_names = {c.name for c in imported_set.characters}
        assert set_character_names == {"Tokisaki Kurumi", "Hatsune Miku"}

@pytest.mark.asyncio
@patch("app.services.ai_tagging.get_tagger")
async def test_ai_tagging_rollup_high_threshold(mock_get_tagger, db_session: AsyncSession, mock_import_set_dir: Path):
    """
    Test dynamic rollup with a higher threshold (e.g. 50%).
    Only tags appearing in >= 50% of images should roll up.
    """
    # Set up settings
    await update_setting(db_session, "ai_auto_tag_enabled", SettingUpdate(value="true"))
    await update_setting(db_session, "ai_confidence_threshold", SettingUpdate(value="0.35"))
    await update_setting(db_session, "ai_rollup_threshold", SettingUpdate(value="0.50"))
    
    mock_tagger = MagicMock()
    mock_tagger.tag_image.side_effect = [
        (["anime", "girl", "solo"], []),  # img1
        (["anime", "boy"], []),          # img2
        (["anime", "girl"], [])          # img3
    ]
    mock_get_tagger.return_value = mock_tagger

    import_item = BatchImportItem(
        source_path=str(mock_import_set_dir),
        creator_name="Test Creator",
        set_title="Anime Set 2",
        is_valid=True,
        status="pending"
    )

    with tempfile.TemporaryDirectory() as vault_dir:
        vault_root = Path(vault_dir)
        
        result_item = await execute_import_item(
            db=db_session,
            item=import_item,
            vault_root=vault_root,
            h_ratio=1.0,
            v_ratio=1.0,
            h_label="horiz",
            v_label="vert",
            delete_source_default=False
        )

        assert result_item.status == "success"
        await db_session.flush()

        # Check database records with eager loading
        stmt = (
            select(Set)
            .options(
                selectinload(Set.images).selectinload(ImageModel.tags),
                selectinload(Set.tags)
            )
            .filter(Set.title == "Anime Set 2")
        )
        res = await db_session.execute(stmt)
        imported_set = res.scalars().first()
        assert imported_set is not None
        
        # Verify rollup with 50% threshold:
        # anime: 3/3 = 100% -> yes
        # girl: 2/3 = 66.7% -> yes
        # solo: 1/3 = 33.3% -> no
        # boy: 1/3 = 33.3% -> no
        set_tag_names = {t.name for t in imported_set.tags}
        assert "Anime" in set_tag_names
        assert "Girl" in set_tag_names
        assert "Solo" not in set_tag_names
        assert "Boy" not in set_tag_names


@pytest.mark.asyncio
@patch("app.services.ai_tagging.get_tagger")
async def test_manual_auto_tag_set(mock_get_tagger, db_session: AsyncSession):
    """
    Test manual auto-tagging on an existing Set.
    Verifies general tags map to images (and roll up),
    character tags map to Set characters, and repeat runs append without duplicates.
    """
    # 1. Setup global settings
    await update_setting(db_session, "ai_model_type", SettingUpdate(value="wd14_onnx"))
    await update_setting(db_session, "ai_confidence_threshold", SettingUpdate(value="0.35"))
    await update_setting(db_session, "ai_rollup_threshold", SettingUpdate(value="0.30"))

    # 2. Setup mock tagger
    mock_tagger = MagicMock()
    mock_tagger.tag_image.side_effect = [
        (["anime", "girl"], ["kurumi"]),
        (["anime"], ["kurumi"]),
        (["anime", "solo"], ["miku"]),
        (["anime"], ["miku"])
    ]
    mock_get_tagger.return_value = mock_tagger

    # 3. Create db records
    test_set = Set(title="Manual Tag Set", local_path="/dummy/set/path")
    db_session.add(test_set)
    await db_session.flush()

    with tempfile.TemporaryDirectory() as tmpdir:
        base = Path(tmpdir)
        p1 = base / "img1.jpg"
        p2 = base / "img2.jpg"
        Image.new("RGB", (100, 100), (0, 0, 0)).save(p1)
        Image.new("RGB", (100, 100), (0, 0, 0)).save(p2)

        img1 = ImageModel(
            filename="img1.jpg",
            local_path=str(p1.resolve()),
            set_id=test_set.id,
            width=100, height=100,
            tags=[]
        )
        img2 = ImageModel(
            filename="img2.jpg",
            local_path=str(p2.resolve()),
            set_id=test_set.id,
            width=100, height=100,
            tags=[]
        )
        db_session.add_all([img1, img2])
        await db_session.flush()
        await db_session.commit()

        # 4. Trigger auto-tagging (First Run)
        from app.services.set_service import auto_tag_set
        updated_set = await auto_tag_set(db_session, test_set.id)
        
        assert updated_set is not None
        await db_session.flush()

        # Fetch eager relations
        stmt = (
            select(Set)
            .options(
                selectinload(Set.images).selectinload(ImageModel.tags),
                selectinload(Set.tags),
                selectinload(Set.characters)
            )
            .filter(Set.id == test_set.id)
        )
        res = await db_session.execute(stmt)
        set_rec = res.scalars().first()

        # Check characters
        char_names = {c.name for c in set_rec.characters}
        assert char_names == {"Kurumi"}

        # Check image tags
        img1_tags = {t.name for t in set_rec.images[0].tags}
        img2_tags = {t.name for t in set_rec.images[1].tags}
        assert img1_tags == {"Anime", "Girl"}
        assert img2_tags == {"Anime"}

        # Check Set rollup tags
        set_tags_names = {t.name for t in set_rec.tags}
        assert set_tags_names == {"Anime", "Girl"}

        # 5. Trigger auto-tagging (Second Run - Appending new tags & characters)
        updated_set_2 = await auto_tag_set(db_session, test_set.id)
        assert updated_set_2 is not None
        await db_session.flush()

        res_2 = await db_session.execute(stmt)
        set_rec_2 = res_2.scalars().first()

        # Verify appended characters (no duplicates)
        char_names_2 = {c.name for c in set_rec_2.characters}
        assert char_names_2 == {"Kurumi", "Miku"}

        # Verify appended image tags (no duplicates)
        img1_tags_2 = {t.name for t in set_rec_2.images[0].tags}
        img2_tags_2 = {t.name for t in set_rec_2.images[1].tags}
        assert img1_tags_2 == {"Anime", "Girl", "Solo"}
        assert img2_tags_2 == {"Anime"}

        # Verify Set rollup tags (no duplicates)
        set_tags_names_2 = {t.name for t in set_rec_2.tags}
        assert set_tags_names_2 == {"Anime", "Girl", "Solo"}


# Real ONNX Model Tests (requires model download and CPU inference)

def test_wd14_onnx_tagger_init():
    """Test tagger initialization and basic properties."""
    tagger = WD14OnnxTagger()
    assert tagger.session is not None
    assert len(tagger.tag_names) > 0
    assert len(tagger.tag_categories) > 0
    assert len(tagger.tag_names) == len(tagger.tag_categories)

def test_wd14_onnx_tagger_preprocessing():
    """Test image preprocessing shape and type."""
    tagger = WD14OnnxTagger()
    img = Image.new("RGB", (800, 600), (128, 128, 128))
    processed = tagger.preprocess_image(img)
    
    assert isinstance(processed, np.ndarray)
    assert processed.dtype == np.float32
    
    if tagger.nchw:
        assert processed.shape == (1, 3, tagger.target_height, tagger.target_width)
    else:
        assert processed.shape == (1, tagger.target_height, tagger.target_width, 3)

def test_wd14_onnx_tagger_tag_image_path(tmp_path):
    """Test tag_image with a file path."""
    tagger = WD14OnnxTagger()
    
    img = Image.new("RGB", (448, 448), (255, 0, 0))
    img_path = tmp_path / "test_image.jpg"
    img.save(img_path)
    
    general_tags, character_tags = tagger.tag_image(img_path, threshold=0.35)
    
    assert isinstance(general_tags, list)
    assert isinstance(character_tags, list)
    for tag in general_tags:
        assert isinstance(tag, str)
    for tag in character_tags:
        assert isinstance(tag, str)

def test_wd14_onnx_tagger_tag_image_pil():
    """Test tag_image with a PIL Image instance."""
    tagger = WD14OnnxTagger()
    img = Image.new("RGB", (448, 448), (255, 255, 255))
    
    general_tags, character_tags = tagger.tag_image(img, threshold=0.1)
    
    assert isinstance(general_tags, list)
    assert isinstance(character_tags, list)
