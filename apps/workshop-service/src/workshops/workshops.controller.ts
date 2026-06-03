import { Body, Controller, Get, Param, Patch, Post, Headers } from '@nestjs/common';
import { AccreditationStatus } from '@autoclaimx/db-client';
import { WorkshopsService } from './workshops.service';

@Controller('workshops')
export class WorkshopsController {
  constructor(private readonly workshops: WorkshopsService) {}

  @Post()
  create(@Headers('x-internal-tenant-id') tid: string, @Body() body: { name: string; email?: string; phone?: string }) {
    return this.workshops.create(tid, body);
  }

  @Get()
  findAll(@Headers('x-internal-tenant-id') tid: string) {
    return this.workshops.findAll(tid);
  }

  @Get(':id')
  findOne(@Headers('x-internal-tenant-id') tid: string, @Param('id') id: string) {
    return this.workshops.findOne(tid, id);
  }

  @Patch(':id')
  update(
    @Headers('x-internal-tenant-id') tid: string,
    @Param('id') id: string,
    @Body() body: {
      name?: string; email?: string; phone?: string; address?: string;
      registrationNumber?: string; accreditationStatus?: AccreditationStatus; active?: boolean;
    },
  ) {
    return this.workshops.update(tid, id, body);
  }
}
