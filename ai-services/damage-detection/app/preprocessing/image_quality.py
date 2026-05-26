"""
Image quality gate: rejects blurry, overexposed, or privacy-violating images
before running YOLOv8 inference.
"""
from __future__ import annotations

import cv2
import numpy as np
from PIL import Image

from app.schemas import QualityFlags

BLUR_THRESHOLD = 80.0  # Laplacian variance below this = too blurry
MIN_BRIGHTNESS = 20    # 0-255 mean
MAX_BRIGHTNESS = 235


def assess_quality(image: Image.Image) -> QualityFlags:
    img_bgr = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    mean_brightness = float(gray.mean())
    exposure_ok = MIN_BRIGHTNESS <= mean_brightness <= MAX_BRIGHTNESS

    # Simple face detection using Haar cascade (fast, good enough for QA)
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
    face_detected = len(faces) > 0

    passed = blur_score >= BLUR_THRESHOLD and exposure_ok

    return QualityFlags(
        blur_score=blur_score,
        exposure_ok=exposure_ok,
        face_detected=face_detected,
        passed=passed,
    )
