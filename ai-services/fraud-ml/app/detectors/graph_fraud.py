"""
Neo4j graph fraud ring detection.

Nodes:   (:Claim), (:PolicyHolder), (:Vehicle), (:Workshop)
Edges:   (Claim)-[:FILED_BY]->(PolicyHolder)
         (Claim)-[:INVOLVES]->(Vehicle)
         (Claim)-[:ASSESSED_BY]->(Workshop)

Signals detected:
  1. Vehicle shared across multiple policyholders     → KNOWN_FRAUD_NETWORK
  2. Policyholder claim velocity (graph-confirmed)    → HIGH_CLAIM_VELOCITY
  3. Workshop linked to many policyholders            → SUSPICIOUS_WORKSHOP
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger(__name__)

NEO4J_URI      = os.getenv("NEO4J_URI",      "bolt://localhost:7687")
NEO4J_USER     = os.getenv("NEO4J_USER",     "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "autoclaimx_secret")

# Lazy driver — created on first use, reused across calls.
_driver = None


def _get_driver():
    global _driver
    if _driver is not None:
        return _driver
    try:
        from neo4j import GraphDatabase  # type: ignore
        _driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        _driver.verify_connectivity()
        logger.info("Neo4j connected at %s", NEO4J_URI)
    except Exception as exc:
        logger.warning("Neo4j unavailable (%s) — graph scoring disabled", exc)
        _driver = None
    return _driver


def upsert_claim(
    claim_id: str,
    tenant_id: str,
    policy_holder_id: str,
    vehicle_plate: str,
    workshop_id: Optional[str] = None,
) -> None:
    """Merge claim, policyholder, vehicle (and optionally workshop) nodes/edges into Neo4j."""
    driver = _get_driver()
    if not driver:
        return
    claim_date = datetime.now(timezone.utc).isoformat()
    try:
        with driver.session() as session:
            session.run(
                """
                MERGE (ph:PolicyHolder {id: $phId, tenantId: $tenantId})
                MERGE (v:Vehicle       {plate: $plate, tenantId: $tenantId})
                MERGE (c:Claim         {id: $claimId,  tenantId: $tenantId})
                  SET c.claimDate = $claimDate
                MERGE (c)-[:FILED_BY]->(ph)
                MERGE (c)-[:INVOLVES]->(v)
                """,
                phId=policy_holder_id, plate=vehicle_plate,
                claimId=claim_id, tenantId=tenant_id, claimDate=claim_date,
            )
            if workshop_id:
                session.run(
                    """
                    MERGE (w:Workshop {id: $workshopId, tenantId: $tenantId})
                    MATCH  (c:Claim   {id: $claimId})
                    MERGE (c)-[:ASSESSED_BY]->(w)
                    """,
                    workshopId=workshop_id, claimId=claim_id, tenantId=tenant_id,
                )
    except Exception as exc:
        logger.error("Neo4j upsert failed for claim %s: %s", claim_id, exc)


def score_graph_fraud(
    claim_id: str,
    tenant_id: str,
    policy_holder_id: str,
    vehicle_plate: str,
    workshop_id: Optional[str] = None,
) -> tuple[float, list[dict]]:
    """
    Run Cypher fraud-ring queries and return (score 0-1, flags list).
    Returns (0.0, []) gracefully when Neo4j is unavailable.
    """
    # Persist nodes first so future claims can reference them
    upsert_claim(claim_id, tenant_id, policy_holder_id, vehicle_plate, workshop_id)

    driver = _get_driver()
    if not driver:
        return 0.0, []

    score = 0.0
    flags: list[dict] = []
    cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()

    try:
        with driver.session() as session:
            # ── Signal 1: vehicle shared across multiple policyholders ──────────
            rec = session.run(
                """
                MATCH (v:Vehicle {plate: $plate, tenantId: $tenantId})
                      <-[:INVOLVES]-(c:Claim)-[:FILED_BY]->(ph:PolicyHolder)
                WHERE ph.id <> $phId
                RETURN count(DISTINCT ph) AS otherPh
                """,
                plate=vehicle_plate, tenantId=tenant_id, phId=policy_holder_id,
            ).single()
            other_ph = rec["otherPh"] if rec else 0
            if other_ph >= 2:
                score += 0.50
                flags.append({
                    "type": "KNOWN_FRAUD_NETWORK",
                    "description": f"Vehicle {vehicle_plate} linked to {other_ph} other policyholders",
                    "severity": "HIGH",
                })
            elif other_ph == 1:
                score += 0.25
                flags.append({
                    "type": "KNOWN_FRAUD_NETWORK",
                    "description": f"Vehicle {vehicle_plate} also claimed by another policyholder",
                    "severity": "MEDIUM",
                })

            # ── Signal 2: policyholder claim velocity (graph-confirmed) ─────────
            rec = session.run(
                """
                MATCH (ph:PolicyHolder {id: $phId, tenantId: $tenantId})
                      <-[:FILED_BY]-(c:Claim)
                WHERE c.id <> $claimId AND c.claimDate > $cutoff
                RETURN count(c) AS recentCount
                """,
                phId=policy_holder_id, claimId=claim_id,
                tenantId=tenant_id, cutoff=cutoff,
            ).single()
            recent = rec["recentCount"] if rec else 0
            if recent >= 3:
                score += 0.30
                flags.append({
                    "type": "HIGH_CLAIM_VELOCITY",
                    "description": f"{recent} claims in 90 days (graph-confirmed)",
                    "severity": "HIGH",
                })

            # ── Signal 3: workshop linked to unusually many policyholders ────────
            if workshop_id:
                rec = session.run(
                    """
                    MATCH (w:Workshop {id: $workshopId, tenantId: $tenantId})
                          <-[:ASSESSED_BY]-(c:Claim)-[:FILED_BY]->(ph:PolicyHolder)
                    RETURN count(DISTINCT ph) AS uniquePh
                    """,
                    workshopId=workshop_id, tenantId=tenant_id,
                ).single()
                unique_ph = rec["uniquePh"] if rec else 0
                if unique_ph > 15:
                    score += 0.20
                    flags.append({
                        "type": "SUSPICIOUS_WORKSHOP",
                        "description": f"Workshop linked to {unique_ph} unique policyholders",
                        "severity": "MEDIUM",
                    })

    except Exception as exc:
        logger.error("Neo4j query failed for claim %s: %s", claim_id, exc)
        return 0.0, []

    return min(1.0, round(score, 4)), flags
