import { Module } from '@nestjs/common';
import { NegotiationController } from './negotiation.controller';
import { NegotiationService } from './negotiation.service';
import { MetricsModule } from '../metrics/metrics.module';

// KafkaService is injected from the global KafkaModule registered in AppModule.
@Module({ imports: [MetricsModule], controllers: [NegotiationController], providers: [NegotiationService] })
export class NegotiationModule {}
