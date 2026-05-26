import { Module } from '@nestjs/common';
import { WorkshopsModule } from './workshops/workshops.module';
import { EstimatesModule } from './estimates/estimates.module';
import { NegotiationModule } from './negotiation/negotiation.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [WorkshopsModule, EstimatesModule, NegotiationModule, HealthModule],
})
export class AppModule {}
