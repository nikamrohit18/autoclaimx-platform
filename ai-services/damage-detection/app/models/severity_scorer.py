"""
Aggregates per-image damage detections into a claim-level severity score.
"""
from __future__ import annotations

from app.schemas import DetectedDamage, Severity

SEVERITY_ORDER = [Severity.LOW, Severity.MEDIUM, Severity.HIGH, Severity.TOTAL_LOSS]

TOTAL_LOSS_INDICATORS = {
    "high_structural": lambda damages: any(
        d.damage_class.value == "STRUCTURAL" and d.severity == Severity.HIGH for d in damages
    ),
    "high_flood": lambda damages: any(
        d.damage_class.value == "FLOOD_DAMAGE" for d in damages
    ),
    "multiple_high": lambda damages: sum(1 for d in damages if d.severity == Severity.HIGH) >= 3,
    "cost_threshold": lambda damages: (
        sum(d.estimated_cost_max for d in damages) > 12000
    ),
}

TOTAL_LOSS_PROBABILITY_WEIGHTS = {
    "high_structural": 0.6,
    "high_flood": 0.7,
    "multiple_high": 0.4,
    "cost_threshold": 0.3,
}


def compute_overall_severity(damages: list[DetectedDamage]) -> tuple[Severity, float]:
    """Returns (overall_severity, total_loss_probability)."""
    if not damages:
        return Severity.LOW, 0.0

    tl_score = 0.0
    for key, check in TOTAL_LOSS_INDICATORS.items():
        if check(damages):
            tl_score += TOTAL_LOSS_PROBABILITY_WEIGHTS[key]

    tl_probability = min(1.0, tl_score)

    if tl_probability >= 0.7:
        return Severity.TOTAL_LOSS, tl_probability

    max_sev = max(damages, key=lambda d: SEVERITY_ORDER.index(d.severity)).severity
    return max_sev, tl_probability
