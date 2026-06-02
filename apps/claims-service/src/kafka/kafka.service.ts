import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Producer, Consumer } from 'kafkajs';
import { KAFKA_TOPICS, KafkaTopic } from '@autoclaimx/config';
import { KafkaEvent } from '@autoclaimx/shared-types';
import { v4 as uuidv4 } from 'uuid';

export { KAFKA_TOPICS };

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private kafka!: Kafka;
  private producer!: Producer;
  private consumers: Consumer[] = [];

  async onModuleInit() {
    this.kafka = new Kafka({
      clientId: 'claims-service',
      brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    });
    this.producer = this.kafka.producer();
    await this.producer.connect();
    this.logger.log('Kafka producer connected');
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
    await Promise.all(this.consumers.map((c) => c.disconnect()));
  }

  async publish<T>(topic: KafkaTopic, payload: T, tenantId: string, correlationId?: string): Promise<void> {
    const event: KafkaEvent<T> = {
      eventId: uuidv4(),
      eventType: topic,
      tenantId,
      timestamp: new Date().toISOString(),
      ...(correlationId ? { correlationId } : {}),
      payload,
    };
    await this.producer.send({
      topic,
      messages: [{ key: tenantId, value: JSON.stringify(event) }],
    });
    this.logger.debug(`Published ${topic}${correlationId ? ` [${correlationId}]` : ''}`);
  }

  async subscribe<T>(
    topic: KafkaTopic,
    groupId: string,
    handler: (event: KafkaEvent<T>) => Promise<void>,
  ): Promise<void> {
    const consumer = this.kafka.consumer({ groupId });
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });
    await consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        const event = JSON.parse(message.value.toString()) as KafkaEvent<T>;
        await handler(event);
      },
    });
    this.consumers.push(consumer);
    this.logger.log(`Subscribed to ${topic} as ${groupId}`);
  }
}
