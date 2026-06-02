import { Module } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { ClaimsModule } from '../claims/claims.module';
import { FraudModule } from '../fraud/fraud.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [ClaimsModule, FraudModule, MetricsModule],
  providers: [WorkflowService],
})
export class WorkflowModule {}
