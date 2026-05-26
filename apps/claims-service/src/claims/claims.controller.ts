import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Headers,
} from '@nestjs/common';
import { ClaimsService } from './claims.service';
import { MediaService } from './media.service';
import { CreateClaimDto } from './dto/create-claim.dto';
import { ClaimStatus } from '@autoclaimx/db-client';

@Controller('claims')
export class ClaimsController {
  constructor(
    private readonly claimsService: ClaimsService,
    private readonly mediaService: MediaService,
  ) {}

  @Post()
  create(
    @Headers('x-internal-tenant-id') tenantId: string,
    @Body() dto: CreateClaimDto,
  ) {
    return this.claimsService.create(tenantId, dto);
  }

  @Get()
  findAll(
    @Headers('x-internal-tenant-id') tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: ClaimStatus,
  ) {
    return this.claimsService.findAll(tenantId, Number(page ?? 1), Number(limit ?? 20), status);
  }

  @Get(':id')
  findOne(
    @Headers('x-internal-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.claimsService.findOne(tenantId, id);
  }

  @Patch(':id/status')
  updateStatus(
    @Headers('x-internal-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() body: { status: ClaimStatus },
  ) {
    return this.claimsService.updateStatus(tenantId, id, body.status);
  }

  @Post(':id/media/upload-url')
  getUploadUrl(
    @Headers('x-internal-tenant-id') tenantId: string,
    @Param('id') claimId: string,
    @Body() body: { contentType: string; angleTag: string; fileName: string },
  ) {
    return this.mediaService.generatePresignedUploadUrl(tenantId, claimId, body);
  }

  @Get(':id/damage-report')
  async getDamageReport(
    @Headers('x-internal-tenant-id') tenantId: string,
    @Param('id') claimId: string,
  ) {
    const claim = await this.claimsService.findOne(tenantId, claimId);
    return claim.damageReport;
  }

  @Get(':id/fraud-score')
  async getFraudScore(
    @Headers('x-internal-tenant-id') tenantId: string,
    @Param('id') claimId: string,
  ) {
    const claim = await this.claimsService.findOne(tenantId, claimId);
    return claim.fraudScore;
  }
}
