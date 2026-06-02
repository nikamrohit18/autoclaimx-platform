"""
negotiation-llm — FastAPI service
AI negotiation agent powered by Claude + LangChain.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Optional
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


_setup_logging('negotiation-llm')

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from app.agents.negotiation_agent import NegotiationAgent, NegotiationOfferOutput
from prometheus_fastapi_instrumentator import Instrumentator

logger = logging.getLogger(__name__)

agent = NegotiationAgent()

app = FastAPI(title="AutoClaimX Negotiation LLM", version="0.1.0")
Instrumentator().instrument(app).expose(app)


@app.get("/health")
def health():
    return {"status": "ok", "service": "negotiation-llm", "model": "claude-sonnet-4-6"}


@app.get("/health/live")
def liveness():
    return {"status": "ok"}


@app.get("/health/ready")
def readiness():
    return {"status": "ok", "checks": {"process": "ready"}}


class GenerateOfferRequest(BaseModel):
    claim_id: str
    claim_number: str = ""
    workshop_name: str
    current_round: int
    max_rounds: int = 3
    style: str = "BALANCED"
    currency: str = "USD"
    damage_report: dict[str, Any]
    workshop_estimate: dict[str, Any]
    benchmark_data: dict[str, Any]
    conversation_history: list[dict[str, str]] = []


@app.post("/generate-offer", response_model=NegotiationOfferOutput)
async def generate_offer(req: GenerateOfferRequest) -> NegotiationOfferOutput:
    try:
        offer = agent.generate_offer(
            claim_id=req.claim_id,
            claim_number=req.claim_number or req.claim_id,
            workshop_name=req.workshop_name,
            current_round=req.current_round,
            max_rounds=req.max_rounds,
            style=req.style,
            currency=req.currency,
            damage_report=req.damage_report,
            workshop_estimate=req.workshop_estimate,
            benchmark_data=req.benchmark_data,
            conversation_history=req.conversation_history,
        )
        return offer
    except Exception as e:
        logger.error(f"Negotiation agent error for claim {req.claim_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
