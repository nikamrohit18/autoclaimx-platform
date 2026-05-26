"""
Pydantic schemas for damage-detection service.
These define the AI pipeline output contract consumed by claims-service.
"""
from __future__ import annotations

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class DamageClass(str, Enum):
    DENT = "DENT"
    SCRATCH = "SCRATCH"
    CRACK = "CRACK"
    BROKEN_GLASS = "BROKEN_GLASS"
    DEPLOYMENT = "DEPLOYMENT"
    FLOOD_DAMAGE = "FLOOD_DAMAGE"
    STRUCTURAL = "STRUCTURAL"


class Severity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    TOTAL_LOSS = "TOTAL_LOSS"


class RepairRecommendation(str, Enum):
    REPAIR = "REPAIR"
    REPLACE = "REPLACE"
    MANUAL_REVIEW = "MANUAL_REVIEW"


class ProcessingStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETE = "COMPLETE"
    FAILED = "FAILED"


class BoundingBox(BaseModel):
    x: float
    y: float
    width: float
    height: float
    image_width: int
    image_height: int


class DetectedDamage(BaseModel):
    part_label: str
    damage_class: DamageClass
    confidence: float = Field(ge=0.0, le=1.0)
    severity: Severity
    recommendation: RepairRecommendation
    estimated_cost_min: float = Field(ge=0)
    estimated_cost_max: float = Field(ge=0)
    bbox: Optional[BoundingBox] = None
    media_asset_id: str


class QualityFlags(BaseModel):
    blur_score: float
    exposure_ok: bool
    face_detected: bool
    passed: bool


# ── Request ───────────────────────────────────────────────────────────────────

class AnalyzeImageRequest(BaseModel):
    media_asset_id: str
    claim_id: str
    tenant_id: str
    s3_key: str
    content_type: str = "image/jpeg"
    angle_tag: Optional[str] = None


# ── Response ─────────────────────────────────────────────────────────────────

class AnalyzeImageResponse(BaseModel):
    media_asset_id: str
    claim_id: str
    processing_status: ProcessingStatus
    quality_flags: QualityFlags
    detected_damages: list[DetectedDamage]
    overall_severity: Optional[Severity]
    total_loss_probability: float = Field(ge=0.0, le=1.0)
    estimated_cost_min: float
    estimated_cost_max: float
    currency: str = "USD"
    model_version: str
    error_message: Optional[str] = None


class BatchAnalyzeRequest(BaseModel):
    items: list[AnalyzeImageRequest]
    claim_id: str
    tenant_id: str


class BatchAnalyzeResponse(BaseModel):
    claim_id: str
    results: list[AnalyzeImageResponse]
    overall_severity: Optional[Severity]
    total_loss_probability: float
    combined_cost_min: float
    combined_cost_max: float
