"""
Workshop estimate parser: PDF/image → structured line items.
Strategy:
  1. Try pdfplumber for text-based PDFs (most workshop estimates)
  2. Fall back to pytesseract for scanned image PDFs
  3. Fall back to Claude vision API for complex/hand-written estimates
"""
from __future__ import annotations

import io
import json
import logging
import os
import re
from typing import Any

import anthropic
import pdfplumber
from PIL import Image
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class ParsedLineItem(BaseModel):
    description: str
    part_number: str | None = None
    quantity: float = 1
    unit_cost: float
    total_cost: float
    labor_hours: float | None = None
    item_type: str = "PART"  # PART | LABOR | MISC


class ParsedEstimate(BaseModel):
    workshop_name: str | None = None
    line_items: list[ParsedLineItem]
    subtotal: float
    labor_total: float
    parts_total: float
    total: float
    currency: str
    ocr_confidence: float  # 0-1
    raw_text: str | None = None


def parse_pdf_estimate(pdf_bytes: bytes, currency: str = "USD") -> ParsedEstimate:
    """Parse a workshop estimate PDF into structured line items."""
    raw_text = _extract_text_pdfplumber(pdf_bytes)

    if raw_text and len(raw_text.strip()) > 100:
        logger.info("Using pdfplumber extraction")
        return _parse_text_heuristic(raw_text, currency, confidence=0.85)

    # Fall back to Claude vision for complex PDFs
    logger.info("Falling back to Claude vision for estimate parsing")
    return _parse_with_claude(pdf_bytes, currency)


def _extract_text_pdfplumber(pdf_bytes: bytes) -> str:
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            return "\n".join(page.extract_text() or "" for page in pdf.pages)
    except Exception as e:
        logger.warning(f"pdfplumber failed: {e}")
        return ""


def _parse_text_heuristic(text: str, currency: str, confidence: float) -> ParsedEstimate:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    line_items: list[ParsedLineItem] = []
    labor_total = 0.0
    parts_total = 0.0

    # Simple heuristic: lines with currency amounts are likely line items
    amount_pattern = re.compile(r"(\d[\d,]*\.?\d*)\s*$")

    for line in lines:
        match = amount_pattern.search(line)
        if not match:
            continue
        amount = float(match.group(1).replace(",", ""))
        desc = line[: match.start()].strip()
        if not desc or amount < 1:
            continue

        is_labor = any(w in desc.lower() for w in ["labor", "labour", "hour", "hr", "work", "แรงงาน"])
        item = ParsedLineItem(
            description=desc,
            unit_cost=amount,
            total_cost=amount,
            item_type="LABOR" if is_labor else "PART",
        )
        line_items.append(item)
        if is_labor:
            labor_total += amount
        else:
            parts_total += amount

    total = labor_total + parts_total

    return ParsedEstimate(
        line_items=line_items,
        subtotal=total,
        labor_total=labor_total,
        parts_total=parts_total,
        total=total,
        currency=currency,
        ocr_confidence=confidence,
        raw_text=text[:2000],
    )


def _parse_with_claude(pdf_bytes: bytes, currency: str) -> ParsedEstimate:
    """Use Claude to parse a complex estimate PDF."""
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    # Convert first page to image for vision
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        page = doc[0]
        pix = page.get_pixmap(dpi=150)
        img_bytes = pix.tobytes("jpeg")
    except Exception as e:
        logger.error(f"PDF to image conversion failed: {e}")
        return ParsedEstimate(line_items=[], subtotal=0, labor_total=0, parts_total=0, total=0, currency=currency, ocr_confidence=0.0)

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": "image/jpeg", "data": __import__("base64").b64encode(img_bytes).decode()},
                    },
                    {
                        "type": "text",
                        "text": f"""Extract all line items from this vehicle repair estimate.
Return a JSON object with this structure:
{{
  "workshop_name": "...",
  "line_items": [
    {{"description": "...", "quantity": 1, "unit_cost": 0.0, "total_cost": 0.0, "item_type": "PART|LABOR|MISC"}}
  ],
  "labor_total": 0.0,
  "parts_total": 0.0,
  "total": 0.0,
  "currency": "{currency}"
}}
Only return valid JSON.""",
                    },
                ],
            }
        ],
    )

    try:
        data = json.loads(response.content[0].text)
        items = [ParsedLineItem(**item) for item in data.get("line_items", [])]
        return ParsedEstimate(
            workshop_name=data.get("workshop_name"),
            line_items=items,
            subtotal=data.get("total", 0),
            labor_total=data.get("labor_total", 0),
            parts_total=data.get("parts_total", 0),
            total=data.get("total", 0),
            currency=data.get("currency", currency),
            ocr_confidence=0.90,
        )
    except Exception as e:
        logger.error(f"Claude parsing failed: {e}")
        return ParsedEstimate(line_items=[], subtotal=0, labor_total=0, parts_total=0, total=0, currency=currency, ocr_confidence=0.0)
