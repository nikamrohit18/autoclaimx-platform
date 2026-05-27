import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaService, KAFKA_TOPICS } from '../kafka/kafka.service';
import { ClaimsService } from '../claims/claims.service';
import { FraudService } from '../fraud/fraud.service';
import { ClaimCreatedPayload, DamageAnalyzedPayload, FraudScoreUpdatedPayload } from '@autoclaimx/shared-types';

// Kafka consumer: listens for AI pipeline results and advances claim workflow.
@Injectable()
export class WorkflowService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    private readonly kafka: KafkaService,
    private readonly claims: ClaimsService,
    private readonly fraud: FraudService,
  ) {}

  async onModuleInit() {
    await this.kafka.subscribe<ClaimCreatedPayload>(
      KAFKA_TOPICS.CLAIM_CREATED,
      'claims-service-claim-consumer',
      async (event) => {
        this.logger.log(`Claim created: ${event.payload.claimId} — running behavioral fraud check`);
        await this.fraud.scoreBehavioral(
          event.tenantId,
          event.payload.claimId,
          event.payload.policyHolderId,
          event.payload.vehiclePlate,
        );
      },
    );

    await this.kafka.subscribe<DamageAnalyzedPayload>(
      KAFKA_TOPICS.DAMAGE_ANALYZED,
      'claims-service-damage-consumer',
      async (event) => {
        this.logger.log(`Damage analyzed for claim ${event.payload.claimId}`);
        await this.claims.applyDamageAnalyzed(event.tenantId, event.payload);
      },
    );

    await this.kafka.subscribe<FraudScoreUpdatedPayload>(
      KAFKA_TOPICS.FRAUD_SCORE_UPDATED,
      'claims-service-fraud-consumer',
      async (event) => {
        const { claimId, riskLevel, autoHold, imageScore, flags } = event.payload;
        this.logger.log(`Fraud score updated for claim ${claimId} → ${riskLevel}`);

        if (imageScore !== undefined) {
          // Event from fraud-ml: merge image signal into the DB record
          await this.fraud.applyImageScore(event.tenantId, claimId, imageScore, flags ?? []);
        }

        if (autoHold) {
          await this.claims.updateStatus(event.tenantId, claimId, 'DISPUTED');
          this.logger.warn(`Auto-held claim ${claimId} due to fraud score`);
        }
      },
    );
  }
}
