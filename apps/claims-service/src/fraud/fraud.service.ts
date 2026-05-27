import { Injectable, Logger } from '@nestjs/common';
import { prisma, withTenant } from '@autoclaimx/db-client';
import { KafkaService, KAFKA_TOPICS } from '../kafka/kafka.service';
import { FraudScoreUpdatedPayload, FraudRisk } from '@autoclaimx/shared-types';
import { v4 as uuidv4 } from 'uuid';

// Behavioral fraud checks run synchronously on claim creation.
// Image and graph fraud are triggered asynchronously via the fraud-ml service.
@Injectable()
export class FraudService {
  private readonly logger = new Logger(FraudService.name);

  constructor(private readonly kafka: KafkaService) {}

  async scoreBehavioral(tenantId: string, claimId: string, policyHolderId: string, vehiclePlate: string): Promise<void> {
    // Claim velocity: count claims in last 90 days for this policy holder
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

    const riskLevel: FraudRisk = behavioralScore >= 0.6 ? 'HIGH' : behavioralScore >= 0.3 ? 'MEDIUM' : 'LOW';
    const autoHoldThreshold = 0.75;

    await withTenant(tenantId, (tx) =>
      tx.fraudScore.upsert({
        where: { claimId },
        create: {
          id: uuidv4(),
          tenantId,
          claimId,
          behavioralScore,
          totalScore: behavioralScore * 0.35,
          riskLevel,
          flags,
        },
        update: { behavioralScore, riskLevel, flags },
      }),
    );

    const payload: FraudScoreUpdatedPayload = {
      claimId,
      fraudScoreId: claimId,
      totalScore: behavioralScore * 0.35,
      riskLevel,
      autoHold: behavioralScore >= autoHoldThreshold,
    };

    await this.kafka.publish(KAFKA_TOPICS.FRAUD_SCORE_UPDATED, payload, tenantId);
    this.logger.log(`Behavioral fraud score ${behavioralScore.toFixed(2)} for claim ${claimId}`);
  }
}
