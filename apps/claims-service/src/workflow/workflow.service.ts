import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaService, KAFKA_TOPICS } from '../kafka/kafka.service';
import { ClaimsService } from '../claims/claims.service';
import { DamageAnalyzedPayload, FraudScoreUpdatedPayload } from '@autoclaimx/shared-types';

// Kafka consumer: listens for AI pipeline results and advances claim workflow.
@Injectable()
export class WorkflowService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    private readonly kafka: KafkaService,
    private readonly claims: ClaimsService,
  ) {}

  async onModuleInit() {
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
        this.logger.log(`Fraud score updated for claim ${event.payload.claimId} → ${event.payload.riskLevel}`);
        if (event.payload.autoHold) {
          await this.claims.updateStatus(event.tenantId, event.payload.claimId, 'DISPUTED');
          this.logger.warn(`Auto-held claim ${event.payload.claimId} due to fraud score`);
        }
      },
    );
  }
}
