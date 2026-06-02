import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';
import { KafkaService, KAFKA_TOPICS } from '../kafka/kafka.service';
import { ClaimsService } from '../claims/claims.service';
import { FraudService } from '../fraud/fraud.service';
import { ClaimCreatedPayload, DamageAnalyzedPayload, FraudScoreUpdatedPayload, NegotiationOfferMadePayload } from '@autoclaimx/shared-types';
import { METRIC_KAFKA_MESSAGES_PROCESSED } from '../metrics/metrics.module';

// Kafka consumer: listens for AI pipeline results and advances claim workflow.
@Injectable()
export class WorkflowService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    private readonly kafka: KafkaService,
    private readonly claims: ClaimsService,
    private readonly fraud: FraudService,
    @InjectMetric(METRIC_KAFKA_MESSAGES_PROCESSED) private readonly kafkaCounter: Counter<string>,
  ) {}

  async onModuleInit() {
    await this.kafka.subscribe<ClaimCreatedPayload>(
      KAFKA_TOPICS.CLAIM_CREATED,
      'claims-service-claim-consumer',
      async (event) => {
        this.kafkaCounter.inc({ topic: KAFKA_TOPICS.CLAIM_CREATED, status: 'success' });
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
        this.kafkaCounter.inc({ topic: KAFKA_TOPICS.DAMAGE_ANALYZED, status: 'success' });
        this.logger.log(`Damage analyzed for claim ${event.payload.claimId}`);
        await this.claims.applyDamageAnalyzed(event.tenantId, event.payload);
      },
    );

    await this.kafka.subscribe<FraudScoreUpdatedPayload>(
      KAFKA_TOPICS.FRAUD_SCORE_UPDATED,
      'claims-service-fraud-consumer',
      async (event) => {
        this.kafkaCounter.inc({ topic: KAFKA_TOPICS.FRAUD_SCORE_UPDATED, status: 'success' });
        const { claimId, riskLevel, autoHold, imageScore, flags } = event.payload;
        this.logger.log(`Fraud score updated for claim ${claimId} → ${riskLevel}`);

        if (imageScore !== undefined) {
          await this.fraud.applyImageScore(event.tenantId, claimId, imageScore, flags ?? []);
        }

        if (autoHold) {
          await this.claims.updateStatus(event.tenantId, claimId, 'DISPUTED');
          this.logger.warn(`Auto-held claim ${claimId} due to fraud score`);
        }
      },
    );

    await this.kafka.subscribe<NegotiationOfferMadePayload>(
      KAFKA_TOPICS.NEGOTIATION_OFFER_MADE,
      'claims-service-negotiation-consumer',
      async (event) => {
        this.kafkaCounter.inc({ topic: KAFKA_TOPICS.NEGOTIATION_OFFER_MADE, status: 'success' });
        const { claimId, round, offerer, sessionStatus } = event.payload;
        if (round === 1 && offerer === 'AI') {
          await this.claims.updateStatus(event.tenantId, claimId, 'NEGOTIATING', 'UNDER_ASSESSMENT');
          this.logger.log(`Claim ${claimId} → NEGOTIATING (round 1 AI offer sent)`);
        }
        if (sessionStatus === 'AGREED') {
          await this.claims.updateStatus(event.tenantId, claimId, 'SETTLED', 'NEGOTIATING');
          this.logger.log(`Claim ${claimId} → SETTLED (negotiation agreed)`);
        } else if (sessionStatus === 'ESCALATED') {
          await this.claims.updateStatus(event.tenantId, claimId, 'DISPUTED', 'NEGOTIATING');
          this.logger.log(`Claim ${claimId} → DISPUTED (negotiation escalated)`);
        }
      },
    );
  }
}
