"""
Unit tests for the NegotiationAgent.
The Anthropic client is mocked — no real API calls are made.
"""
from __future__ import annotations

import json
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


def _set_llm_response(mock_client: MagicMock, offer: dict) -> None:
    """Configure the mock client to return a JSON-wrapped offer string."""
    raw = f"```json\n{json.dumps(offer)}\n```"
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text=raw)]
    mock_client.messages.create.return_value = mock_response


# ── generate_offer ─────────────────────────────────────────────────────────────

class TestGenerateOffer:
    def test_returns_negotiation_offer_output_on_valid_response(self):
        agent, mock_client = _make_agent_with_mock_client()
        _set_llm_response(mock_client, SAMPLE_OFFER)

        result = agent.generate_offer(
            claim_id="c1",
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
        _set_llm_response(mock_client, SAMPLE_OFFER)

        agent.generate_offer(
            claim_id="c1",
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
        _set_llm_response(mock_client, {**SAMPLE_OFFER, "should_accept": True, "should_escalate": False})

        result = agent.generate_offer(
            claim_id="c2", workshop_name="W", current_round=2, max_rounds=3,
            style="BALANCED", currency="MYR",
            damage_report={}, workshop_estimate={}, benchmark_data={}, conversation_history=[],
        )

        assert result.should_accept is True

    def test_should_escalate_true_on_final_round_signal(self):
        agent, mock_client = _make_agent_with_mock_client()
        _set_llm_response(mock_client, {**SAMPLE_OFFER, "should_accept": False, "should_escalate": True})

        result = agent.generate_offer(
            claim_id="c3", workshop_name="W", current_round=3, max_rounds=3,
            style="AGGRESSIVE", currency="MYR",
            damage_report={}, workshop_estimate={}, benchmark_data={}, conversation_history=[],
        )

        assert result.should_escalate is True

    def test_parses_json_without_markdown_fences(self):
        agent, mock_client = _make_agent_with_mock_client()
        raw = json.dumps(SAMPLE_OFFER)  # no ``` fences
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text=raw)]
        mock_client.messages.create.return_value = mock_response

        result = agent.generate_offer(
            claim_id="c4", workshop_name="W", current_round=1, max_rounds=3,
            style="BALANCED", currency="MYR",
            damage_report={}, workshop_estimate={}, benchmark_data={}, conversation_history=[],
        )

        assert result.recommended_total == 4200.0

    def test_raises_on_unparseable_llm_response(self):
        agent, mock_client = _make_agent_with_mock_client()
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="This is not JSON at all.")]
        mock_client.messages.create.return_value = mock_response

        with pytest.raises(Exception):
            agent.generate_offer(
                claim_id="c5", workshop_name="W", current_round=1, max_rounds=3,
                style="BALANCED", currency="MYR",
                damage_report={}, workshop_estimate={}, benchmark_data={}, conversation_history=[],
            )

    def test_conversation_history_is_included_in_prompt(self):
        agent, mock_client = _make_agent_with_mock_client()
        _set_llm_response(mock_client, SAMPLE_OFFER)

        history = [{"round": "1", "offerer": "AI", "amount": "4200", "currency": "MYR", "message": "First offer"}]

        agent.generate_offer(
            claim_id="c6", workshop_name="W", current_round=2, max_rounds=3,
            style="BALANCED", currency="MYR",
            damage_report={}, workshop_estimate={}, benchmark_data={},
            conversation_history=history,
        )

        call_kwargs = mock_client.messages.create.call_args
        messages = call_kwargs.kwargs.get("messages") or call_kwargs.args[0] if call_kwargs.args else []
        if not messages and call_kwargs.kwargs:
            messages = call_kwargs.kwargs.get("messages", [])
        user_content = messages[0]["content"] if messages else ""
        assert "First offer" in user_content


# ── _parse_response ────────────────────────────────────────────────────────────

class TestParseResponse:
    def test_parses_json_fenced_response(self):
        agent, _client = _make_agent_with_mock_client()
        raw = f"```json\n{json.dumps(SAMPLE_OFFER)}\n```"
        result = agent._parse_response(raw)
        assert result.recommended_total == 4200.0

    def test_parses_plain_json_response(self):
        agent, _client = _make_agent_with_mock_client()
        result = agent._parse_response(json.dumps(SAMPLE_OFFER))
        assert result.confidence == pytest.approx(0.87)

    def test_raises_on_invalid_json(self):
        agent, _client = _make_agent_with_mock_client()
        with pytest.raises(Exception):
            agent._parse_response("not json")
