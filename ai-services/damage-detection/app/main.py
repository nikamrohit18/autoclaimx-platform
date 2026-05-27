"""
damage-detection — FastAPI service
Runs YOLOv8 inference on uploaded vehicle images and returns structured damage reports.
"""
from __future__ import annotations

import io
import logging
import os
from contextlib import asynccontextmanager

import boto3
from fastapi import FastAPI, HTTPException
from PIL import Image

from app.models.detector import DamageDetector
from app.models.severity_scorer import compute_overall_severity
from app.preprocessing.image_quality import assess_quality
from app.schemas import (
    AnalyzeImageRequest,
    AnalyzeImageResponse,
    BatchAnalyzeRequest,
    BatchAnalyzeResponse,
    ProcessingStatus,
    Severity,
)
from app import kafka_worker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

detector = DamageDetector()

s3 = boto3.client(
    "s3",
    region_name=os.getenv("AWS_REGION", "ap-southeast-1"),
)
MEDIA_BUCKET = os.getenv("S3_MEDIA_BUCKET", "autoclaimx-media-dev")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Loading damage detection model...")
    detector.load()
    logger.info("Model ready")
    stop_event = kafka_worker.start(detector)
    yield
    stop_event.set()  # signal worker thread to exit cleanly


app = FastAPI(
    title="AutoClaimX Damage Detection",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "damage-detection", "model_version": detector.MODEL_VERSION}


@app.post("/analyze", response_model=AnalyzeImageResponse)
async def analyze_image(req: AnalyzeImageRequest) -> AnalyzeImageResponse:
    """
    Analyze a single vehicle image.
    Fetches image from S3, runs quality gate, then YOLOv8 inference.
    """
    try:
        obj = s3.get_object(Bucket=MEDIA_BUCKET, Key=req.s3_key)
        image_bytes = obj["Body"].read()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as e:
        logger.error(f"Failed to fetch {req.s3_key} from S3: {e}")
        return AnalyzeImageResponse(
            media_asset_id=req.media_asset_id,
            claim_id=req.claim_id,
            processing_status=ProcessingStatus.FAILED,
            quality_flags={"blur_score": 0, "exposure_ok": False, "face_detected": False, "passed": False},  # type: ignore
            detected_damages=[],
            overall_severity=None,
            total_loss_probability=0.0,
            estimated_cost_min=0,
            estimated_cost_max=0,
            model_version=detector.MODEL_VERSION,
            error_message=str(e),
        )

    quality = assess_quality(image)
    if not quality.passed:
        logger.warning(f"Image {req.media_asset_id} failed quality gate: blur={quality.blur_score:.1f}")
        return AnalyzeImageResponse(
            media_asset_id=req.media_asset_id,
            claim_id=req.claim_id,
            processing_status=ProcessingStatus.FAILED,
            quality_flags=quality,
            detected_damages=[],
            overall_severity=None,
            total_loss_probability=0.0,
            estimated_cost_min=0,
            estimated_cost_max=0,
            model_version=detector.MODEL_VERSION,
            error_message="Image failed quality gate",
        )

    damages = detector.detect(image, req.media_asset_id)
    severity, tl_prob = compute_overall_severity(damages)

    cost_min = sum(d.estimated_cost_min for d in damages)
    cost_max = sum(d.estimated_cost_max for d in damages)

    return AnalyzeImageResponse(
        media_asset_id=req.media_asset_id,
        claim_id=req.claim_id,
        processing_status=ProcessingStatus.COMPLETE,
        quality_flags=quality,
        detected_damages=damages,
        overall_severity=severity,
        total_loss_probability=tl_prob,
        estimated_cost_min=cost_min,
        estimated_cost_max=cost_max,
        model_version=detector.MODEL_VERSION,
    )


@app.post("/analyze/batch", response_model=BatchAnalyzeResponse)
async def analyze_batch(req: BatchAnalyzeRequest) -> BatchAnalyzeResponse:
    """
    Analyze multiple images for one claim and aggregate into a combined damage report.
    """
    results = []
    for item in req.items:
        result = await analyze_image(item)
        results.append(result)

    all_damages = [d for r in results for d in r.detected_damages]
    overall_severity, tl_prob = compute_overall_severity(all_damages)

    return BatchAnalyzeResponse(
        claim_id=req.claim_id,
        results=results,
        overall_severity=overall_severity,
        total_loss_probability=tl_prob,
        combined_cost_min=sum(r.estimated_cost_min for r in results),
        combined_cost_max=sum(r.estimated_cost_max for r in results),
    )
