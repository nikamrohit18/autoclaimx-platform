import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import { KAFKA_TOPICS, KafkaTopic } from '@autoclaimx/config';
import { KafkaEvent } from '@autoclaimx/shared-types';
import { v4 as uuidv4 } from 'uuid';

export { KAFKA_TOPICS };

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private kafka!: Kafka;
  private producer!: Producer;

  async onModuleInit() {
    this.kafka = new Kafka({
      clientId: 'workshop-service',
      brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    });
    this.producer = this.kafka.producer();
    await this.producer.connect();
    this.logger.log('Kafka producer connected');
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
  }

  async publish<T>(topic: KafkaTopic, payload: T, tenantId: string): Promise<void> {
    const event: KafkaEvent<T> = {
      eventId: uuidv4(),
      eventType: topic,
      tenantId,
      timestamp: new Date().toISOString(),
      payload,
    };
    await this.producer.send({
      topic,
      messages: [{ key: tenantId, value: JSON.stringify(event) }],
    });
    this.logger.debug(`Published ${topic}`);
  }
}
