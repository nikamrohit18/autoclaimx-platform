import { Injectable, Logger } from '@nestjs/common';
import { withTenant } from '@autoclaimx/db-client';
import { KafkaService, KAFKA_TOPICS } from '../kafka/kafka.service';
import { FraudScoreUpdatedPayload, FraudRisk } from '@autoclaimx/shared-types';
import { v4 as uuidv4 } from 'uuid';

// Composite fraud score weights (must sum to 1.0)
const W_BEHAVIORAL = 0.25;
const W_IMAGE      = 0.55;
const W_GRAPH      = 0.20;

function computeTotal(behavioral: number, image: number, graph: number): number {
  return Math.min(1, behavioral * W_BEHAVIORAL + image * W_IMAGE + graph * W_GRAPH);
}

function riskLevel(total: number): FraudRisk {
  return total >= 0.6 ? 'HIGH' : total >= 0.3 ? 'MEDIUM' : 'LOW';
}

@Injectable()
export class FraudService {
  private readonly logger = new Logger(FraudService.name);
  private readonly fraudMlUrl = process.env.FRAUD_ML_URL ?? 'http://localhost:8003';

  constructor(private readonly kafka: KafkaService) {}

  async scoreBehavioral(
    tenantId: string,
    claimId: string,
    policyHolderId: string,
    vehiclePlate: string,
  ): Promise<void> {
    // ── Behavioral: claim velocity in last 90 days ──────────────────────────
    const recentClaims = await withTenant(tenantId, (tx) =>
      tx.claim.count({
        where: {
          tenantId,
          policyHolderId,
          createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
          id: { not: claimId },
        },
      }),
    );

    let behavioralScore = 0;
    const flags: Array<{ type: string; description: string; severity: string }> = [];

    if (recentClaims >= 3) {
      behavioralScore = Math.min(0.8, recentClaims * 0.2);
      flags.push({ type: 'HIGH_CLAIM_VELOCITY', description: `${recentClaims} claims in last 90 days`, severity: 'HIGH' });
    } else if (recentClaims >= 1) {
      behavioralScore = 0.2;
    }

    // ── Graph: Neo4j fraud ring detection ───────────────────────────────────
    let graphScore = 0;
    let graphFlags: Array<{ type: string; description: string; severity: string }> = [];
    try {
      const res = await fetch(`${this.fraudMlUrl}/analyze/graph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim_id: claimId,
          tenant_id: tenantId,
          policy_holder_id: policyHolderId,
          vehicle_plate: vehiclePlate,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json() as { graph_score: number; flags: typeof graphFlags };
        graphScore = data.graph_score ?? 0;
        graphFlags = data.flags ?? [];
        this.logger.log(`Graph fraud score ${graphScore.toFixed(2)} for claim ${claimId}`);
      }
    } catch (err) {
      this.logger.warn(`Graph fraud call failed for ${claimId} — Neo4j may be offline: ${err}`);
    }

    const allFlags = [...flags, ...graphFlags];
    const totalScore = computeTotal(behavioralScore, 0, graphScore);
    const risk = riskLevel(totalScore);
    const autoHoldThreshold = 0.75;

    const fraudScoreId = uuidv4();
    await withTenant(tenantId, (tx) =>
      tx.fraudScore.upsert({
        where: { claimId },
        create: {
          id: fraudScoreId,
          tenantId,
          claimId,
          behavioralScore,
          graphScore,
          totalScore,
          riskLevel: risk,
          flags: allFlags,
        },
        update: { behavioralScore, graphScore, totalScore, riskLevel: risk, flags: allFlags },
      }),
    );

    const payload: FraudScoreUpdatedPayload = {
      claimId,
      fraudScoreId,
      totalScore,
      riskLevel: risk,
      autoHold: behavioralScore >= autoHoldThreshold,
    };

    await this.kafka.publish(KAFKA_TOPICS.FRAUD_SCORE_UPDATED, payload, tenantId);
    this.logger.log(
      `Fraud scored for claim ${claimId}: behavioral=${behavioralScore.toFixed(2)} graph=${graphScore.toFixed(2)} total=${totalScore.toFixed(2)} risk=${risk}`,
    );
  }

  // Called by WorkflowService when fraud-ml publishes fraud.score.updated with imageScore.
  async applyImageScore(
    tenantId: string,
    claimId: string,
    imageScore: number,
    incomingFlags: Array<{ type: string; description: string; severity: string }>,
  ): Promise<void> {
    const existing = await withTenant(tenantId, (tx) =>
      tx.fraudScore.findUnique({ where: { claimId } }),
    );

    const behavioralScore = existing ? Number(existing.behavioralScore) : 0;
    const graphScore      = existing ? Number(existing.graphScore)      : 0;
    const totalScore      = computeTotal(behavioralScore, imageScore, graphScore);
    const risk            = riskLevel(totalScore);
    const existingFlags   = (existing?.flags as Array<{ type: string; description: string; severity: string }> | null) ?? [];
    const allFlags        = [...existingFlags, ...incomingFlags];

    await withTenant(tenantId, (tx) =>
      tx.fraudScore.upsert({
        where: { claimId },
        create: {
          id: uuidv4(),
          tenantId,
          claimId,
          imageScore,
          totalScore,
          riskLevel: risk,
          flags: allFlags,
        },
        update: { imageScore, totalScore, riskLevel: risk, flags: allFlags },
      }),
    );

    this.logger.log(
      `Image fraud merged for claim ${claimId}: image=${imageScore.toFixed(2)} graph=${graphScore.toFixed(2)} total=${totalScore.toFixed(2)}`,
    );
  }
}
