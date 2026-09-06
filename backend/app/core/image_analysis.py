"""
Image analysis and visual feature extraction utilities.
"""

from pathlib import Path
from typing import Optional
import cv2
import numpy as np
import structlog

from app.core.crop import load_image

logger = structlog.get_logger(__name__)


def calculate_phash(path: Path | str) -> Optional[str]:
    """Compute perceptual hash of an image using OpenCV pHash."""
    try:
        img = load_image(path)
        if img is None:
            return None
        hasher = cv2.img_hash.PHash_create()
        return hasher.compute(img).tobytes().hex()
    except Exception as e:
        logger.error("Error calculating pHash", path=str(path), error=str(e))
        return None


def calculate_dominant_color(path: Path | str) -> Optional[str]:
    """Compute dominant color hex string via OpenCV K-Means clustering."""
    try:
        img = load_image(path)
        if img is None:
            return None

        img = cv2.resize(img, (50, 50))
        data = img.reshape((-1, 3))
        data = np.float32(data)

        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
        flags = cv2.KMEANS_RANDOM_CENTERS
        _compactness, labels, centers = cv2.kmeans(data, 3, None, criteria, 10, flags)

        unique, counts = np.unique(labels, return_counts=True)
        dominant_label = unique[np.argmax(counts)]
        dominant_center = centers[dominant_label]

        b, g, r = (
            int(dominant_center[0]),
            int(dominant_center[1]),
            int(dominant_center[2]),
        )
        return f"#{r:02x}{g:02x}{b:02x}".upper()
    except Exception as e:
        logger.error("Error calculating dominant color", path=str(path), error=str(e))
        return None
