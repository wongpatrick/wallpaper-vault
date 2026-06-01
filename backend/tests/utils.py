import os
import numpy as np
import cv2
from pathlib import Path

def create_synthetic_image(width: int = 1920, height: int = 1080, color: tuple[int, int, int] = (255, 0, 0)) -> np.ndarray:
    """
    Creates a solid color synthetic image as a numpy array.
    color should be in BGR format (e.g., (255, 0, 0) is Blue).
    """
    img = np.zeros((height, width, 3), dtype=np.uint8)
    img[:] = color
    return img

def create_synthetic_saliency_image(width: int = 1920, height: int = 1080) -> np.ndarray:
    """
    Creates a synthetic image with a highly salient feature (e.g., a bright circle)
    in a specific location to reliably test saliency cropping.
    The feature will be in the top right quadrant.
    """
    img = np.zeros((height, width, 3), dtype=np.uint8)
    # Background
    img[:] = (50, 50, 50)
    
    # Salient feature (bright yellow circle)
    center_x = int(width * 0.75)
    center_y = int(height * 0.25)
    radius = min(width, height) // 10
    cv2.circle(img, (center_x, center_y), radius, (0, 255, 255), -1)
    
    return img

def save_temp_image(img: np.ndarray, path: str | Path) -> str:
    """
    Saves an image array to a temporary path.
    """
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(p), img)
    return str(p)
