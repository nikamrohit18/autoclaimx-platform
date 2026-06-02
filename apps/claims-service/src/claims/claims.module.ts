import { Module } from '@nestjs/common';
import { ClaimsController } from './claims.controller';
import { ClaimsService } from './claims.service';
import { MediaService } from './media.service';
import { EventsModule } from '../events/events.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [EventsModule, MetricsModule],
  controllers: [ClaimsController],
  providers: [ClaimsService, MediaService],
  exports: [ClaimsService],
})
export class ClaimsModule {}
