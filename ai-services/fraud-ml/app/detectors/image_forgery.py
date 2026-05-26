"""
Image forgery detection using Error Level Analysis (ELA).
ELA detects JPEG recompression artifacts that indicate image editing.
"""
from __future__ import annotations

import io
import logging

import numpy as np
from PIL import Image, ImageChops, ImageEnhance

logger = logging.getLogger(__name__)

ELA_QUALITY = 90
ELA_SCALE = 15
FORGERY_THRESHOLD = 35.0  # ELA mean above this is suspicious


def ela_score(image: Image.Image) -> float:
    """
    Compute Error Level Analysis score.
    Higher score = more likely to be manipulated.
    Returns a value in 0-100 range.
    """
    if image.mode != "RGB":
        image = image.convert("RGB")

    # Save at reduced quality and compare with original
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=ELA_QUALITY)
    buffer.seek(0)
    recompressed = Image.open(buffer)

    diff = ImageChops.difference(image, recompressed)
    # Amplify differences for visibility
    enhancer = ImageEnhance.Brightness(diff)
    diff_amplified = enhancer.enhance(ELA_SCALE)

    ela_array = np.array(diff_amplified)
    return float(ela_array.mean())


def check_exif_consistency(exif_timestamp: str | None, claim_date: str | None) -> tuple[bool, str | None]:
    """
    Returns (consistent, reason_if_not).
    Mismatch between EXIF timestamp and claim incident date is a fraud signal.
    """
    if not exif_timestamp or not claim_date:
        return True, None  # Can't check without both

    from datetime import datetime, timedelta

    try:
        exif_dt = datetime.fromisoformat(exif_timestamp)
        claim_dt = datetime.fromisoformat(claim_date)
        delta = abs((exif_dt - claim_dt).days)

        if delta > 7:
            return False, f"EXIF timestamp differs from claim date by {delta} days"
        return True, None
    except ValueError:
        return True, None  # Unparseable timestamps — don't penalize


def score_image_fraud(
    image: Image.Image,
    exif_timestamp: str | None = None,
    claim_date: str | None = None,
) -> tuple[float, list[dict]]:
    """
    Returns (score 0-1, list of flag dicts).
    """
    flags = []
    score = 0.0

    ela = ela_score(image)
    if ela > FORGERY_THRESHOLD:
        ela_normalized = min(1.0, (ela - FORGERY_THRESHOLD) / (100 - FORGERY_THRESHOLD))
        score += ela_normalized * 0.7
        flags.append({
            "type": "IMAGE_FORGERY",
            "description": f"ELA score {ela:.1f} exceeds threshold {FORGERY_THRESHOLD}",
            "severity": "HIGH" if ela > 60 else "MEDIUM",
        })

    consistent, reason = check_exif_consistency(exif_timestamp, claim_date)
    if not consistent:
        score += 0.3
        flags.append({
            "type": "EXIF_MISMATCH",
            "description": reason,
            "severity": "MEDIUM",
        })

    return min(1.0, score), flags
