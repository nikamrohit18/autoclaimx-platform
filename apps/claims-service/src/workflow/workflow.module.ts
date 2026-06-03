import { Module } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { ClaimsModule } from '../claims/claims.module';
import { FraudModule } from '../fraud/fraud.module';
import { MetricsModule } from '../metrics/metrics.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [ClaimsModule, FraudModule, MetricsModule, NotificationModule],
  providers: [WorkflowService],
})
export class WorkflowModule {}
