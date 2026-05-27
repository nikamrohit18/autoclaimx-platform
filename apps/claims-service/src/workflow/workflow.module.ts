import { Module } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { ClaimsModule } from '../claims/claims.module';
import { FraudModule } from '../fraud/fraud.module';

@Module({
  imports: [ClaimsModule, FraudModule],
  providers: [WorkflowService],
})
export class WorkflowModule {}
