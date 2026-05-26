import { Module } from '@nestjs/common';
import { Controller, Get, Post, Body, Param, Headers } from '@nestjs/common';
import { prisma, withTenant } from '@autoclaimx/db-client';
import { v4 as uuidv4 } from 'uuid';

class CreateTenantDto { name!: string; slug!: string; plan?: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'; }

@Controller('tenants')
class TenantsController {
  @Post()
  async create(@Body() dto: CreateTenantDto) {
    return prisma.tenant.create({
      data: { id: uuidv4(), name: dto.name, slug: dto.slug, plan: dto.plan ?? 'STARTER' },
    });
  }

  @Get()
  findAll() { return prisma.tenant.findMany({ where: { active: true } }); }

  @Get(':id')
  findOne(@Param('id') id: string) { return prisma.tenant.findUniqueOrThrow({ where: { id } }); }

  @Get('me')
  me(@Headers('x-internal-tenant-id') tid: string) { return prisma.tenant.findUniqueOrThrow({ where: { id: tid } }); }
}

@Module({ controllers: [TenantsController] })
export class TenantsModule {}
