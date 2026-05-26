import { Module } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { ClaimsModule } from '../claims/claims.module';

@Module({
  imports: [ClaimsModule],
  providers: [WorkflowService],
})
export class WorkflowModule {}
