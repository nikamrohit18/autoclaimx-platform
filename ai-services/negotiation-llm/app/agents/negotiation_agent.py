"""
AI Negotiation Agent — LangChain + Claude API.
Generates structured negotiation offers in response to workshop estimates.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

import anthropic
from pydantic import BaseModel

from app.agents.prompt_templates import (
    ACCEPT_OR_ESCALATE_INSTRUCTION,
    COUNTER_OFFER_INSTRUCTION,
    NEGOTIATION_TURN_PROMPT,
    OPENING_OFFER_INSTRUCTION,
    STYLE_INSTRUCTIONS,
    SYSTEM_PROMPT,
)

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 4096


class NegotiationLineItem(BaseModel):
    description: str
    workshop_amount: float
    ai_recommended_amount: float
    benchmark_min: float
    benchmark_max: float
    flagged: bool
    flag_reason: Optional[str] = None
    recommendation: str  # ACCEPT | REDUCE | REPLACE_WITH_REPAIR


class NegotiationOfferOutput(BaseModel):
    recommended_total: float
    currency: str
    line_items: list[NegotiationLineItem]
    message: str  # Professional message to workshop (can be bilingual)
    confidence: float  # 0-1: how confident AI is in this offer
    should_accept: bool   # True if workshop's position is reasonable
    should_escalate: bool  # True if human should take over
    reasoning: str  # Internal reasoning (not shown to workshop)


_NEGOTIATION_TOOL = {
    "name": "submit_negotiation_offer",
    "description": "Submit the structured negotiation offer after analysing the workshop estimate.",
    "input_schema": {
        "type": "object",
        "properties": {
            "recommended_total": {"type": "number", "description": "Total counter-offer amount"},
            "currency": {"type": "string", "description": "Currency code, e.g. THB"},
            "line_items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "description": {"type": "string"},
                        "workshop_amount": {"type": "number"},
                        "ai_recommended_amount": {"type": "number"},
                        "benchmark_min": {"type": "number"},
                        "benchmark_max": {"type": "number"},
                        "flagged": {"type": "boolean"},
                        "flag_reason": {"type": ["string", "null"]},
                        "recommendation": {"type": "string", "enum": ["ACCEPT", "REDUCE", "REPLACE_WITH_REPAIR"]},
                    },
                    "required": ["description", "workshop_amount", "ai_recommended_amount",
                                 "benchmark_min", "benchmark_max", "flagged", "recommendation"],
                },
            },
            "message": {"type": "string", "description": "Professional message to the workshop"},
            "confidence": {"type": "number", "description": "Confidence 0-1"},
            "should_accept": {"type": "boolean"},
            "should_escalate": {"type": "boolean"},
            "reasoning": {"type": "string", "description": "Internal reasoning"},
        },
        "required": ["recommended_total", "currency", "line_items", "message",
                     "confidence", "should_accept", "should_escalate", "reasoning"],
    },
}


class NegotiationAgent:
    def __init__(self) -> None:
        self.client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    def generate_offer(
        self,
        claim_id: str,
        claim_number: str,
        workshop_name: str,
        current_round: int,
        max_rounds: int,
        style: str,
        currency: str,
        damage_report: dict[str, Any],
        workshop_estimate: dict[str, Any],
        benchmark_data: dict[str, Any],
        conversation_history: list[dict[str, str]],
    ) -> NegotiationOfferOutput:
        system = SYSTEM_PROMPT.format(
            style_instructions=STYLE_INSTRUCTIONS.get(style, STYLE_INSTRUCTIONS["BALANCED"])
        )

        if current_round == 1:
            task = OPENING_OFFER_INSTRUCTION
        elif current_round >= max_rounds:
            task = ACCEPT_OR_ESCALATE_INSTRUCTION
        else:
            task = COUNTER_OFFER_INSTRUCTION

        user_content = NEGOTIATION_TURN_PROMPT.format(
            claim_id=claim_id,
            claim_number=claim_number,
            workshop_name=workshop_name,
            current_round=current_round,
            max_rounds=max_rounds,
            currency=currency,
            damage_report_summary=json.dumps(damage_report, indent=2),
            workshop_estimate_summary=json.dumps(workshop_estimate, indent=2),
            benchmark_data=json.dumps(benchmark_data, indent=2),
            negotiation_history=self._format_history(conversation_history),
            task_instruction=task,
        )

        messages = [{"role": "user", "content": user_content}]

        response = self.client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=system,
            messages=messages,
            tools=[_NEGOTIATION_TOOL],
            tool_choice={"type": "tool", "name": "submit_negotiation_offer"},
        )

        tool_block = next((b for b in response.content if b.type == "tool_use"), None)
        if tool_block is None:
            raise ValueError(f"No tool_use block in response for claim {claim_id}")

        data = tool_block.input
        logger.info(f"LLM tool input for claim {claim_id} round {current_round}: recommended_total={data.get('recommended_total')}")

        return NegotiationOfferOutput(**data)

    def _format_history(self, history: list[dict[str, str]]) -> str:
        if not history:
            return "No previous rounds."
        lines = []
        for h in history:
            lines.append(f"Round {h['round']} ({h['offerer']}): {h['amount']} {h['currency']}\n{h['message']}")
        return "\n\n".join(lines)
