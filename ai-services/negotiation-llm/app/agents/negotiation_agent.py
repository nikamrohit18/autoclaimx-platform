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


class NegotiationAgent:
    def __init__(self) -> None:
        self.client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    def generate_offer(
        self,
        claim_id: str,
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
            # Use extended thinking for complex negotiations (Phase 2 feature)
            # thinking={"type": "enabled", "budget_tokens": 2000},
        )

        raw_text = response.content[0].text
        logger.debug(f"LLM response for claim {claim_id} round {current_round}:\n{raw_text}")

        return self._parse_response(raw_text)

    def _format_history(self, history: list[dict[str, str]]) -> str:
        if not history:
            return "No previous rounds."
        lines = []
        for h in history:
            lines.append(f"Round {h['round']} ({h['offerer']}): {h['amount']} {h['currency']}\n{h['message']}")
        return "\n\n".join(lines)

    def _parse_response(self, text: str) -> NegotiationOfferOutput:
        # Extract JSON from the response (Claude may wrap it in markdown)
        import re

        json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            # Try direct parse
            json_str = text.strip()

        data = json.loads(json_str)
        return NegotiationOfferOutput(**data)
