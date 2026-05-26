"""
negotiation-llm — FastAPI service
AI negotiation agent powered by Claude + LangChain.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from app.agents.negotiation_agent import NegotiationAgent, NegotiationOfferOutput

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

agent = NegotiationAgent()

app = FastAPI(title="AutoClaimX Negotiation LLM", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok", "service": "negotiation-llm", "model": "claude-sonnet-4-6"}


class GenerateOfferRequest(BaseModel):
    claim_id: str
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
