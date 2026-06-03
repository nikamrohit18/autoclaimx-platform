"""
Unit tests for the NegotiationAgent.
The Anthropic client is mocked — no real API calls are made.
"""
from __future__ import annotations

import os
import pytest
from unittest.mock import MagicMock, patch

from app.agents.negotiation_agent import NegotiationAgent, NegotiationOfferOutput


# ── Fixtures ───────────────────────────────────────────────────────────────────

SAMPLE_OFFER: dict = {
    "recommended_total": 4200.0,
    "currency": "MYR",
    "line_items": [
        {
            "description": "Front bumper replacement",
            "workshop_amount": 1800.0,
            "ai_recommended_amount": 1600.0,
            "benchmark_min": 1400.0,
            "benchmark_max": 1800.0,
            "flagged": False,
            "flag_reason": None,
            "recommendation": "REDUCE",
        }
    ],
    "message": "We propose MYR 4,200 based on benchmark data.",
    "confidence": 0.87,
    "should_accept": False,
    "should_escalate": False,
    "reasoning": "Workshop estimate is 10% above benchmark range.",
}

SAMPLE_DAMAGE_REPORT = {
    "overall_severity": "MODERATE",
    "estimated_cost_min": 3500,
    "estimated_cost_max": 5000,
    "ai_damages": [],
}

SAMPLE_WORKSHOP_ESTIMATE = {
    "line_items": [],
    "total": 4700,
    "labor_total": 1800,
    "parts_total": 2900,
    "currency": "MYR",
}


def _make_agent_with_mock_client() -> tuple[NegotiationAgent, MagicMock]:
    """Returns (agent, mock_anthropic_client)."""
    mock_client = MagicMock()
    with patch("app.agents.negotiation_agent.anthropic.Anthropic", return_value=mock_client), \
         patch.dict(os.environ, {"ANTHROPIC_API_KEY": "test-key"}):
        agent = NegotiationAgent()
    return agent, mock_client


def _set_tool_use_response(mock_client: MagicMock, offer: dict) -> None:
    """Configure the mock client to return a tool_use block containing the offer."""
    tool_block = MagicMock()
    tool_block.type = "tool_use"
    tool_block.input = offer
    mock_response = MagicMock()
    mock_response.content = [tool_block]
    mock_client.messages.create.return_value = mock_response


def _set_no_tool_response(mock_client: MagicMock) -> None:
    """Configure the mock client to return a response with no tool_use block."""
    text_block = MagicMock()
    text_block.type = "text"
    mock_response = MagicMock()
    mock_response.content = [text_block]
    mock_client.messages.create.return_value = mock_response


# ── generate_offer ─────────────────────────────────────────────────────────────

class TestGenerateOffer:
    def test_returns_negotiation_offer_output_on_valid_response(self):
        agent, mock_client = _make_agent_with_mock_client()
        _set_tool_use_response(mock_client, SAMPLE_OFFER)

        result = agent.generate_offer(
            claim_id="c1",
            claim_number="ACX-2024-00001",
            workshop_name="AutoFix KL",
            current_round=1,
            max_rounds=3,
            style="BALANCED",
            currency="MYR",
            damage_report=SAMPLE_DAMAGE_REPORT,
            workshop_estimate=SAMPLE_WORKSHOP_ESTIMATE,
            benchmark_data={},
            conversation_history=[],
        )

        assert isinstance(result, NegotiationOfferOutput)
        assert result.recommended_total == 4200.0
        assert result.currency == "MYR"
        assert result.should_accept is False

    def test_calls_anthropic_messages_create_exactly_once(self):
        agent, mock_client = _make_agent_with_mock_client()
        _set_tool_use_response(mock_client, SAMPLE_OFFER)

        agent.generate_offer(
            claim_id="c1",
            claim_number="ACX-2024-00001",
            workshop_name="AutoFix",
            current_round=1,
            max_rounds=3,
            style="BALANCED",
            currency="MYR",
            damage_report={},
            workshop_estimate={},
            benchmark_data={},
            conversation_history=[],
        )

        mock_client.messages.create.assert_called_once()

    def test_should_accept_true_when_llm_signals_acceptance(self):
        agent, mock_client = _make_agent_with_mock_client()
        _set_tool_use_response(mock_client, {**SAMPLE_OFFER, "should_accept": True, "should_escalate": False})

        result = agent.generate_offer(
            claim_id="c2", claim_number="ACX-2024-00002", workshop_name="W",
            current_round=2, max_rounds=3, style="BALANCED", currency="MYR",
            damage_report={}, workshop_estimate={}, benchmark_data={}, conversation_history=[],
        )

        assert result.should_accept is True

    def test_should_escalate_true_on_final_round_signal(self):
        agent, mock_client = _make_agent_with_mock_client()
        _set_tool_use_response(mock_client, {**SAMPLE_OFFER, "should_accept": False, "should_escalate": True})

        result = agent.generate_offer(
            claim_id="c3", claim_number="ACX-2024-00003", workshop_name="W",
            current_round=3, max_rounds=3, style="AGGRESSIVE", currency="MYR",
            damage_report={}, workshop_estimate={}, benchmark_data={}, conversation_history=[],
        )

        assert result.should_escalate is True

    def test_raises_when_no_tool_use_block_in_response(self):
        agent, mock_client = _make_agent_with_mock_client()
        _set_no_tool_response(mock_client)

        with pytest.raises(ValueError, match="No tool_use block"):
            agent.generate_offer(
                claim_id="c4", claim_number="ACX-2024-00004", workshop_name="W",
                current_round=1, max_rounds=3, style="BALANCED", currency="MYR",
                damage_report={}, workshop_estimate={}, benchmark_data={}, conversation_history=[],
            )

    def test_conversation_history_is_included_in_prompt(self):
        agent, mock_client = _make_agent_with_mock_client()
        _set_tool_use_response(mock_client, SAMPLE_OFFER)

        history = [{"round": "1", "offerer": "AI", "amount": "4200", "currency": "MYR", "message": "First offer"}]

        agent.generate_offer(
            claim_id="c5", claim_number="ACX-2024-00005", workshop_name="W",
            current_round=2, max_rounds=3, style="BALANCED", currency="MYR",
            damage_report={}, workshop_estimate={}, benchmark_data={},
            conversation_history=history,
        )

        call_kwargs = mock_client.messages.create.call_args
        messages = call_kwargs.kwargs.get("messages", [])
        user_content = messages[0]["content"] if messages else ""
        assert "First offer" in user_content

    def test_confidence_value_is_preserved(self):
        agent, mock_client = _make_agent_with_mock_client()
        _set_tool_use_response(mock_client, SAMPLE_OFFER)

        result = agent.generate_offer(
            claim_id="c6", claim_number="ACX-2024-00006", workshop_name="W",
            current_round=1, max_rounds=3, style="BALANCED", currency="MYR",
            damage_report={}, workshop_estimate={}, benchmark_data={}, conversation_history=[],
        )

        assert result.confidence == pytest.approx(0.87)

    def test_reasoning_field_is_preserved(self):
        agent, mock_client = _make_agent_with_mock_client()
        _set_tool_use_response(mock_client, SAMPLE_OFFER)

        result = agent.generate_offer(
            claim_id="c7", claim_number="ACX-2024-00007", workshop_name="W",
            current_round=1, max_rounds=3, style="CUSTOMER_FIRST", currency="MYR",
            damage_report={}, workshop_estimate={}, benchmark_data={}, conversation_history=[],
        )

        assert "benchmark" in result.reasoning.lower()

    def test_line_items_are_returned(self):
        agent, mock_client = _make_agent_with_mock_client()
        _set_tool_use_response(mock_client, SAMPLE_OFFER)

        result = agent.generate_offer(
            claim_id="c8", claim_number="ACX-2024-00008", workshop_name="W",
            current_round=1, max_rounds=3, style="BALANCED", currency="MYR",
            damage_report={}, workshop_estimate={}, benchmark_data={}, conversation_history=[],
        )

        assert len(result.line_items) == 1
        assert result.line_items[0].description == "Front bumper replacement"

    def test_recommended_total_matches_offer(self):
        agent, mock_client = _make_agent_with_mock_client()
        _set_tool_use_response(mock_client, {**SAMPLE_OFFER, "recommended_total": 3800.0})

        result = agent.generate_offer(
            claim_id="c9", claim_number="ACX-2024-00009", workshop_name="W",
            current_round=2, max_rounds=5, style="AGGRESSIVE", currency="MYR",
            damage_report={}, workshop_estimate={}, benchmark_data={}, conversation_history=[],
        )

        assert result.recommended_total == pytest.approx(3800.0)

    def test_message_field_is_preserved(self):
        agent, mock_client = _make_agent_with_mock_client()
        _set_tool_use_response(mock_client, SAMPLE_OFFER)

        result = agent.generate_offer(
            claim_id="c10", claim_number="ACX-2024-00010", workshop_name="W",
            current_round=1, max_rounds=3, style="BALANCED", currency="MYR",
            damage_report={}, workshop_estimate={}, benchmark_data={}, conversation_history=[],
        )

        assert result.message == "We propose MYR 4,200 based on benchmark data."
