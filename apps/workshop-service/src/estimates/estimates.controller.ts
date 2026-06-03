import { Body, Controller, Get, Param, Post, Headers } from '@nestjs/common';
import { EstimatesService } from './estimates.service';

@Controller('workshops/:workshopId/estimates')
export class EstimatesController {
  constructor(private readonly estimates: EstimatesService) {}

  @Get()
  findByWorkshop(
    @Headers('x-internal-tenant-id') tid: string,
    @Param('workshopId') workshopId: string,
  ) {
    return this.estimates.findByWorkshop(tid, workshopId);
  }

  @Post('upload-url')
  getUploadUrl(
    @Headers('x-internal-tenant-id') tid: string,
    @Param('workshopId') workshopId: string,
    @Body() body: { claimId: string; fileName: string },
  ) {
    return this.estimates.getUploadUrl(tid, workshopId, body.claimId, body.fileName);
  }

  @Post('confirm')
  confirm(
    @Headers('x-internal-tenant-id') tid: string,
    @Param('workshopId') workshopId: string,
    @Body() body: { claimId: string; s3Key: string },
  ) {
    return this.estimates.confirmAndParse(tid, workshopId, body.claimId, body.s3Key);
  }
}
