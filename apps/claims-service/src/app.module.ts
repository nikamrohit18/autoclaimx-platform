import { Module } from '@nestjs/common';
import { ClaimsModule } from './claims/claims.module';
import { WorkflowModule } from './workflow/workflow.module';
import { FraudModule } from './fraud/fraud.module';
import { HealthModule } from './health/health.module';
import { KafkaModule } from './kafka/kafka.module';
import { EventsModule } from './events/events.module';

@Module({
  imports: [KafkaModule, EventsModule, ClaimsModule, WorkflowModule, FraudModule, HealthModule],
})
export class AppModule {}
