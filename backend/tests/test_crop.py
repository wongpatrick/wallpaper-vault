import os
from pathlib import Path
from app.core.crop import process_image, load_image
from tests.utils import create_synthetic_saliency_image, save_temp_image

def test_process_image_horizontal(tmp_path: Path):
    """
    Test cropping an image horizontally based on saliency.
    """
    # Create an image that is very tall (vertical) and we want a horizontal crop
    img = create_synthetic_saliency_image(width=1000, height=2000)
    input_path = tmp_path / "test_input.jpg"
    out_path = tmp_path / "test_output.jpg"
    save_temp_image(img, input_path)
    
    success, final_path = process_image(
        img_path=str(input_path),
        out_path=str(out_path),
        auto_orient=False,
        target_w=1920,
        target_h=1080, # 16:9 ratio
        exact=False,
        horz_label="16x9",
        vert_label="9x16"
    )
    
    assert success is True
    assert final_path is not None
    assert os.path.exists(final_path)
    
    # Check the dimensions of the cropped image
    cropped_img = load_image(final_path)
    assert cropped_img is not None
    H, W = cropped_img.shape[:2]
    # Check that it's horizontal
    assert W > H

def test_process_image_vertical(tmp_path: Path):
    """
    Test cropping an image vertically based on saliency.
    """
    # Create an image that is very wide (horizontal) and we want a vertical crop
    img = create_synthetic_saliency_image(width=2000, height=1000)
    input_path = tmp_path / "test_input_vert.jpg"
    out_path = tmp_path / "test_output_vert.jpg"
    save_temp_image(img, input_path)
    
    success, final_path = process_image(
        img_path=str(input_path),
        out_path=str(out_path),
        auto_orient=False,
        target_w=1080,
        target_h=1920, # 9:16 ratio
        exact=False,
        horz_label="16x9",
        vert_label="9x16"
    )
    
    assert success is True
    assert final_path is not None
    assert os.path.exists(final_path)
    
    cropped_img = load_image(final_path)
    assert cropped_img is not None
    H, W = cropped_img.shape[:2]
    # Check that it's vertical
    assert H > W
