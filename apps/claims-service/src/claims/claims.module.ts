import { Module } from '@nestjs/common';
import { ClaimsController } from './claims.controller';
import { ClaimsService } from './claims.service';
import { MediaService } from './media.service';

@Module({
  controllers: [ClaimsController],
  providers: [ClaimsService, MediaService],
  exports: [ClaimsService],
})
export class ClaimsModule {}
