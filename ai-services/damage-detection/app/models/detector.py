"""
YOLOv8 inference wrapper for vehicle damage detection.
Model weights are loaded from S3 on startup; falls back to pretrained COCO weights in dev.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image
from ultralytics import YOLO

from app.schemas import BoundingBox, DamageClass, DetectedDamage, RepairRecommendation, Severity

logger = logging.getLogger(__name__)

# Maps YOLO class names → DamageClass enum.
# Pretrained COCO model won't have these classes; this mapping is for the
# fine-tuned insurance damage model (Phase 2).
DAMAGE_CLASS_MAP: dict[str, DamageClass] = {
    "dent": DamageClass.DENT,
    "scratch": DamageClass.SCRATCH,
    "crack": DamageClass.CRACK,
    "broken_glass": DamageClass.BROKEN_GLASS,
    "airbag_deployment": DamageClass.DEPLOYMENT,
    "flood_damage": DamageClass.FLOOD_DAMAGE,
    "structural_deformation": DamageClass.STRUCTURAL,
}

# Damage class → rough cost range seed (USD).
# This will be replaced by the parts catalog lookup in Phase 2.
COST_SEEDS: dict[DamageClass, tuple[float, float]] = {
    DamageClass.DENT: (150, 800),
    DamageClass.SCRATCH: (100, 500),
    DamageClass.CRACK: (200, 1200),
    DamageClass.BROKEN_GLASS: (300, 1500),
    DamageClass.DEPLOYMENT: (1500, 6000),
    DamageClass.FLOOD_DAMAGE: (2000, 15000),
    DamageClass.STRUCTURAL: (3000, 20000),
}

SEVERITY_THRESHOLDS = {
    # (area_fraction, base_severity)
    DamageClass.STRUCTURAL: (0.01, Severity.HIGH),
    DamageClass.DEPLOYMENT: (0.01, Severity.HIGH),
    DamageClass.FLOOD_DAMAGE: (0.01, Severity.HIGH),
}


class DamageDetector:
    MODEL_VERSION = "yolov8n-pretrained-coco-v1"

    def __init__(self) -> None:
        self._model: Optional[YOLO] = None

    def load(self) -> None:
        weights_path = Path("model_weights/damage_v1.pt")
        if weights_path.exists():
            self._model = YOLO(str(weights_path))
            self.MODEL_VERSION = "damage-detector-v1"
            logger.info("Loaded fine-tuned damage detection model")
        else:
            # Phase 1: use pretrained YOLOv8n as a placeholder.
            # Fine-tuning happens in Phase 2 with insurance data.
            self._model = YOLO("yolov8n.pt")
            logger.warning("Fine-tuned weights not found — using pretrained COCO model (Phase 1 placeholder)")

    def detect(self, image: Image.Image, media_asset_id: str, min_confidence: float = 0.35) -> list[DetectedDamage]:
        assert self._model is not None, "Model not loaded — call load() first"

        img_array = np.array(image)
        results = self._model(img_array, conf=min_confidence, verbose=False)

        damages: list[DetectedDamage] = []
        h, w = img_array.shape[:2]

        for result in results:
            for box in result.boxes:
                cls_name = result.names[int(box.cls)]
                damage_class = DAMAGE_CLASS_MAP.get(cls_name)
                if damage_class is None:
                    # Pretrained COCO class — skip (Phase 1 limitation)
                    continue

                confidence = float(box.conf)
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                area_fraction = ((x2 - x1) * (y2 - y1)) / (w * h)

                severity = self._severity(damage_class, area_fraction, confidence)
                recommendation = self._recommend(damage_class, severity)
                cost_min, cost_max = COST_SEEDS.get(damage_class, (100, 500))

                damages.append(
                    DetectedDamage(
                        part_label=cls_name.replace("_", " ").title(),
                        damage_class=damage_class,
                        confidence=confidence,
                        severity=severity,
                        recommendation=recommendation,
                        estimated_cost_min=cost_min,
                        estimated_cost_max=cost_max,
                        bbox=BoundingBox(x=x1, y=y1, width=x2 - x1, height=y2 - y1, image_width=w, image_height=h),
                        media_asset_id=media_asset_id,
                    )
                )

        return damages

    @staticmethod
    def _severity(damage_class: DamageClass, area_fraction: float, confidence: float) -> Severity:
        # Structural/deployment/flood are always HIGH regardless of area
        if damage_class in (DamageClass.STRUCTURAL, DamageClass.DEPLOYMENT, DamageClass.FLOOD_DAMAGE):
            return Severity.HIGH

        if area_fraction > 0.15:
            return Severity.HIGH
        elif area_fraction > 0.05:
            return Severity.MEDIUM
        return Severity.LOW

    @staticmethod
    def _recommend(damage_class: DamageClass, severity: Severity) -> RepairRecommendation:
        if severity == Severity.HIGH or damage_class in (DamageClass.STRUCTURAL, DamageClass.DEPLOYMENT):
            return RepairRecommendation.REPLACE
        if damage_class == DamageClass.BROKEN_GLASS:
            return RepairRecommendation.REPLACE
        return RepairRecommendation.REPAIR
