"""
fraud-ml — FastAPI service
Image forgery detection, behavioral anomaly, and graph fraud signals.
"""
from __future__ import annotations

import io
import logging
import os
from contextlib import asynccontextmanager
from typing import Optional
from pythonjsonlogger import jsonlogger


def _setup_logging(service_name: str) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(
        jsonlogger.JsonFormatter(
            fmt='%(asctime)s %(name)s %(levelname)s %(message)s',
            rename_fields={'asctime': 'timestamp', 'levelname': 'level', 'name': 'logger'},
        )
    )

    class _Ctx(logging.Filter):
        def filter(self, record: logging.LogRecord) -> bool:
            record.service = service_name  # type: ignore[attr-defined]
            record.env = os.getenv('ENVIRONMENT', 'development')  # type: ignore[attr-defined]
            return True

    handler.addFilter(_Ctx())
    logging.root.handlers = []
    logging.root.addHandler(handler)
    logging.root.setLevel(os.getenv('LOG_LEVEL', 'INFO'))


_setup_logging('fraud-ml')

import boto3
from fastapi import FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel

from app.detectors.image_forgery import score_image_fraud
from app import kafka_worker
from prometheus_fastapi_instrumentator import Instrumentator

logger = logging.getLogger(__name__)

s3 = boto3.client("s3", region_name=os.getenv("AWS_REGION", "ap-southeast-1"))
MEDIA_BUCKET = os.getenv("S3_MEDIA_BUCKET", "autoclaimx-media-dev")


@asynccontextmanager
async def lifespan(app: FastAPI):
    stop_event = kafka_worker.start()
    yield
    stop_event.set()


app = FastAPI(title="AutoClaimX Fraud ML", version="0.1.0", lifespan=lifespan)
Instrumentator().instrument(app).expose(app)


@app.get("/health")
def health():
    return {"status": "ok", "service": "fraud-ml"}


@app.get("/health/live")
def liveness():
    return {"status": "ok"}


@app.get("/health/ready")
def readiness():
    return {"status": "ok", "checks": {"process": "ready"}}


class ImageFraudRequest(BaseModel):
    s3_key: str
    media_asset_id: str
    claim_id: str
    exif_timestamp: Optional[str] = None
    claim_date: Optional[str] = None


class FraudSignalResponse(BaseModel):
    media_asset_id: str
    image_score: float
    flags: list[dict]


@app.post("/analyze/image", response_model=FraudSignalResponse)
async def analyze_image_fraud(req: ImageFraudRequest) -> FraudSignalResponse:
    try:
        obj = s3.get_object(Bucket=MEDIA_BUCKET, Key=req.s3_key)
        image = Image.open(io.BytesIO(obj["Body"].read())).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

    score, flags = score_image_fraud(image, req.exif_timestamp, req.claim_date)
    return FraudSignalResponse(media_asset_id=req.media_asset_id, image_score=score, flags=flags)


class GraphFraudRequest(BaseModel):
    claim_id: str
    tenant_id: str
    policy_holder_id: str
    vehicle_plate: str
    workshop_id: Optional[str] = None


class GraphFraudResponse(BaseModel):
    graph_score: float
    flags: list[dict]
    connected_flagged_claims: list[str]


@app.post("/analyze/graph", response_model=GraphFraudResponse)
async def analyze_graph_fraud(req: GraphFraudRequest) -> GraphFraudResponse:
    """
    Neo4j graph fraud ring detection.
    Phase 1: returns placeholder (0 score). Phase 2: full GNN queries.
    """
    # TODO Phase 2: connect to Neo4j, run Cypher fraud ring queries
    return GraphFraudResponse(graph_score=0.0, flags=[], connected_flagged_claims=[])
