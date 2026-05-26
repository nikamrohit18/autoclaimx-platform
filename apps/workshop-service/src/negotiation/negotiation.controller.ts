import { Body, Controller, Get, Param, Post, Headers } from '@nestjs/common';
import { NegotiationService } from './negotiation.service';

@Controller('claims/:claimId/negotiation')
export class NegotiationController {
  constructor(private readonly negotiation: NegotiationService) {}

  @Post()
  start(
    @Headers('x-internal-tenant-id') tid: string,
    @Param('claimId') claimId: string,
    @Body() body: { workshopId: string; workshopEstimateId: string },
  ) {
    return this.negotiation.startSession(tid, claimId, body.workshopId, body.workshopEstimateId);
  }

  @Get()
  get(@Headers('x-internal-tenant-id') tid: string, @Param('claimId') claimId: string) {
    return this.negotiation.getSession(tid, claimId);
  }

  @Post('counter')
  counter(
    @Headers('x-internal-tenant-id') tid: string,
    @Param('claimId') claimId: string,
    @Body() body: { sessionId: string; amount: number; message: string },
  ) {
    return this.negotiation.workshopCounter(tid, body.sessionId, body.amount, body.message);
  }
}
