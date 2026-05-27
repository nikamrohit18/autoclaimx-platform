import { Module } from '@nestjs/common';
import { KafkaModule } from './kafka/kafka.module';
import { WorkshopsModule } from './workshops/workshops.module';
import { EstimatesModule } from './estimates/estimates.module';
import { NegotiationModule } from './negotiation/negotiation.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [KafkaModule, WorkshopsModule, EstimatesModule, NegotiationModule, HealthModule],
})
export class AppModule {}
