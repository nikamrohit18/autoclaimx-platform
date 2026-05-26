export * from './env.schema';

// Kafka topic constants — single source of truth for all services
export const KAFKA_TOPICS = {
  CLAIM_CREATED: 'claim.created',
  MEDIA_UPLOADED: 'media.uploaded',
  DAMAGE_ANALYZED: 'damage.analyzed',
  FRAUD_SCORE_UPDATED: 'fraud.score.updated',
  NEGOTIATION_OFFER_MADE: 'negotiation.offer.made',
  NOTIFICATION_SEND: 'notification.send',
  AUDIT_EVENT: 'audit.event',
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];
