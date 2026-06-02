"""
Unit tests for fraud-ml image forgery detection logic.
These tests cover pure functions only — no S3, Kafka, or FastAPI calls.
"""
from __future__ import annotations

import numpy as np
import pytest
from PIL import Image
from unittest.mock import patch

from app.detectors.image_forgery import (
    FORGERY_THRESHOLD,
    check_exif_consistency,
    ela_score,
    score_image_fraud,
)


# ── Helpers ────────────────────────────────────────────────────────────────────

def make_solid_image(color: tuple[int, int, int] = (0, 0, 0), size: int = 100) -> Image.Image:
    """Creates a solid-colour RGB image — expected to have a very low ELA score."""
    return Image.fromarray(np.full((size, size, 3), color, dtype=np.uint8), mode="RGB")


def make_noise_image(size: int = 100) -> Image.Image:
    """Creates a random-noise RGB image — expected to produce a higher ELA score."""
    rng = np.random.default_rng(seed=42)
    data = rng.integers(0, 256, (size, size, 3), dtype=np.uint8)
    return Image.fromarray(data, mode="RGB")


# ── ela_score ──────────────────────────────────────────────────────────────────

class TestElaScore:
    def test_returns_float(self):
        img = make_solid_image()
        result = ela_score(img)
        assert isinstance(result, float)

    def test_solid_black_image_scores_near_zero(self):
        img = make_solid_image(color=(0, 0, 0))
        result = ela_score(img)
        # Solid uniform image compresses very consistently — ELA should be minimal
        assert result < FORGERY_THRESHOLD

    def test_solid_white_image_scores_near_zero(self):
        img = make_solid_image(color=(255, 255, 255))
        result = ela_score(img)
        assert result < FORGERY_THRESHOLD

    def test_noise_image_scores_higher_than_solid(self):
        solid = ela_score(make_solid_image())
        noise = ela_score(make_noise_image())
        assert noise > solid

    def test_accepts_non_rgb_image_by_converting(self):
        # RGBA image should be accepted (converted to RGB internally)
        data = np.zeros((50, 50, 4), dtype=np.uint8)
        img = Image.fromarray(data, mode="RGBA")
        result = ela_score(img)
        assert isinstance(result, float)


# ── check_exif_consistency ─────────────────────────────────────────────────────

class TestCheckExifConsistency:
    def test_both_none_is_consistent(self):
        consistent, reason = check_exif_consistency(None, None)
        assert consistent is True
        assert reason is None

    def test_only_exif_present_is_consistent(self):
        consistent, reason = check_exif_consistency("2024-01-10T10:00:00", None)
        assert consistent is True

    def test_only_claim_date_present_is_consistent(self):
        consistent, reason = check_exif_consistency(None, "2024-01-10")
        assert consistent is True

    def test_matching_dates_are_consistent(self):
        consistent, reason = check_exif_consistency("2024-06-01T14:30:00", "2024-06-01")
        assert consistent is True
        assert reason is None

    def test_dates_within_7_days_are_consistent(self):
        consistent, reason = check_exif_consistency("2024-06-01T00:00:00", "2024-06-07T00:00:00")
        assert consistent is True

    def test_dates_more_than_7_days_apart_are_inconsistent(self):
        consistent, reason = check_exif_consistency("2024-01-01T00:00:00", "2024-01-15T00:00:00")
        assert consistent is False
        assert reason is not None
        assert "14" in reason or "days" in reason.lower()

    def test_unparseable_timestamps_treated_as_consistent(self):
        consistent, reason = check_exif_consistency("not-a-date", "also-not-a-date")
        assert consistent is True


# ── score_image_fraud ──────────────────────────────────────────────────────────

class TestScoreImageFraud:
    def test_clean_image_no_exif_returns_zero_score_and_no_flags(self):
        img = make_solid_image()
        score, flags = score_image_fraud(img)
        assert score == pytest.approx(0.0, abs=0.01)
        assert len(flags) == 0

    def test_high_ela_raises_image_forgery_flag(self):
        img = make_solid_image()
        # Patch ela_score to return a value well above the threshold
        with patch("app.detectors.image_forgery.ela_score", return_value=70.0):
            score, flags = score_image_fraud(img)

        assert score > 0.0
        assert any(f["type"] == "IMAGE_FORGERY" for f in flags)

    def test_exif_mismatch_raises_exif_flag(self):
        img = make_solid_image()
        score, flags = score_image_fraud(img, exif_timestamp="2024-01-01T00:00:00", claim_date="2024-02-01T00:00:00")
        assert any(f["type"] == "EXIF_MISMATCH" for f in flags)
        assert score > 0.0

    def test_high_ela_severity_is_high_above_60(self):
        img = make_solid_image()
        with patch("app.detectors.image_forgery.ela_score", return_value=80.0):
            _score, flags = score_image_fraud(img)

        forgery_flag = next(f for f in flags if f["type"] == "IMAGE_FORGERY")
        assert forgery_flag["severity"] == "HIGH"

    def test_high_ela_severity_is_medium_between_threshold_and_60(self):
        img = make_solid_image()
        with patch("app.detectors.image_forgery.ela_score", return_value=45.0):
            _score, flags = score_image_fraud(img)

        forgery_flag = next(f for f in flags if f["type"] == "IMAGE_FORGERY")
        assert forgery_flag["severity"] == "MEDIUM"

    def test_combined_ela_and_exif_score_is_capped_at_1(self):
        img = make_solid_image()
        with patch("app.detectors.image_forgery.ela_score", return_value=200.0):
            score, _flags = score_image_fraud(img, exif_timestamp="2020-01-01T00:00:00", claim_date="2024-01-01T00:00:00")

        assert score <= 1.0
