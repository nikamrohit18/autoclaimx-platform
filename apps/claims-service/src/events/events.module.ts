import { Module } from '@nestjs/common';
import { ClaimsGateway } from './claims.gateway';

@Module({ providers: [ClaimsGateway], exports: [ClaimsGateway] })
export class EventsModule {}
