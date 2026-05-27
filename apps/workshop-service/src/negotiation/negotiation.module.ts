import { Module } from '@nestjs/common';
import { NegotiationController } from './negotiation.controller';
import { NegotiationService } from './negotiation.service';

// KafkaService is injected from the global KafkaModule registered in AppModule.
@Module({ controllers: [NegotiationController], providers: [NegotiationService] })
export class NegotiationModule {}
