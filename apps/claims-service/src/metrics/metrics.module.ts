import { Module } from '@nestjs/common';
import { makeCounterProvider, makeHistogramProvider } from '@willsoto/nestjs-prometheus';

export const METRIC_CLAIMS_CREATED = 'claims_created_total';
export const METRIC_CLAIM_STATUS_TRANSITIONS = 'claim_status_transitions_total';
export const METRIC_KAFKA_MESSAGES_PROCESSED = 'kafka_messages_processed_total';
export const METRIC_FRAUD_SCORE_APPLIED = 'fraud_score_applied_total';

const providers = [
  makeCounterProvider({
    name: METRIC_CLAIMS_CREATED,
    help: 'Total number of claims created',
    labelNames: ['tenant_id'],
  }),
  makeCounterProvider({
    name: METRIC_CLAIM_STATUS_TRANSITIONS,
    help: 'Total claim status transitions',
    labelNames: ['from_status', 'to_status'],
  }),
  makeCounterProvider({
    name: METRIC_KAFKA_MESSAGES_PROCESSED,
    help: 'Total Kafka messages processed by topic',
    labelNames: ['topic', 'status'],
  }),
  makeCounterProvider({
    name: METRIC_FRAUD_SCORE_APPLIED,
    help: 'Total fraud score evaluations',
    labelNames: ['risk_level', 'auto_hold'],
  }),
  makeHistogramProvider({
    name: 'claim_processing_duration_seconds',
    help: 'Time in seconds from FNOL to UNDER_ASSESSMENT',
    buckets: [1, 5, 15, 30, 60, 120, 300],
  }),
];

@Module({ providers, exports: providers })
export class MetricsModule {}
