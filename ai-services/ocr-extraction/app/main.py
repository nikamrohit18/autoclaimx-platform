"""
ocr-extraction — FastAPI service
Parses workshop estimate PDFs into structured line items.
"""
from __future__ import annotations

import io
import logging
import os

import boto3
from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel

from app.parsers.estimate_parser import ParsedEstimate, parse_pdf_estimate

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

s3 = boto3.client("s3", region_name=os.getenv("AWS_REGION", "ap-southeast-1"))
DOCS_BUCKET = os.getenv("S3_DOCS_BUCKET", "autoclaimx-docs-dev")

app = FastAPI(title="AutoClaimX OCR Extraction", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok", "service": "ocr-extraction"}


class ParseFromS3Request(BaseModel):
    s3_key: str
    currency: str = "USD"


@app.post("/parse/s3", response_model=ParsedEstimate)
async def parse_from_s3(req: ParseFromS3Request) -> ParsedEstimate:
    """Fetch a PDF from S3 and parse it into structured line items."""
    try:
        obj = s3.get_object(Bucket=DOCS_BUCKET, Key=req.s3_key)
        pdf_bytes = obj["Body"].read()
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Could not fetch {req.s3_key}: {e}")

    return parse_pdf_estimate(pdf_bytes, req.currency)


@app.post("/parse/upload", response_model=ParsedEstimate)
async def parse_upload(file: UploadFile = File(...), currency: str = "USD") -> ParsedEstimate:
    """Parse an uploaded PDF directly (dev/testing convenience)."""
    pdf_bytes = await file.read()
    return parse_pdf_estimate(pdf_bytes, currency)
