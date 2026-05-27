import { Body, Controller, Delete, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenants.create(dto);
  }

  @Get()
  findAll() {
    return this.tenants.findAll();
  }

  @Get('me')
  me(@Headers('x-internal-tenant-id') tid: string) {
    return this.tenants.findOne(tid);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenants.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenants.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tenants.remove(id);
  }
}
