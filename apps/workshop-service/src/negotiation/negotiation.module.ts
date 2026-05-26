import { Module } from '@nestjs/common';
import { NegotiationController } from './negotiation.controller';
import { NegotiationService } from './negotiation.service';

@Module({ controllers: [NegotiationController], providers: [NegotiationService] })
export class NegotiationModule {}
