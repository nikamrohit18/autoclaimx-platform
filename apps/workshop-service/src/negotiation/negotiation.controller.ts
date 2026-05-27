import { Body, Controller, Get, Param, Post, Headers } from '@nestjs/common';
import { NegotiationService } from './negotiation.service';

@Controller('negotiations')
export class NegotiationController {
  constructor(private readonly negotiation: NegotiationService) {}

  @Post()
  start(
    @Headers('x-internal-tenant-id') tid: string,
    @Body() body: { claimId: string; workshopId: string; workshopEstimateId: string },
  ) {
    return this.negotiation.startSession(tid, body.claimId, body.workshopId, body.workshopEstimateId);
  }

  @Get('claim/:claimId')
  getByClaimId(@Headers('x-internal-tenant-id') tid: string, @Param('claimId') claimId: string) {
    return this.negotiation.getSession(tid, claimId);
  }

  @Get('workshop/:workshopId')
  getByWorkshop(@Headers('x-internal-tenant-id') tid: string, @Param('workshopId') workshopId: string) {
    return this.negotiation.getSessionsByWorkshop(tid, workshopId);
  }

  @Post(':sessionId/counter')
  counter(
    @Headers('x-internal-tenant-id') tid: string,
    @Param('sessionId') sessionId: string,
    @Body() body: { amount: number; message: string },
  ) {
    return this.negotiation.workshopCounter(tid, sessionId, body.amount, body.message);
  }
}
