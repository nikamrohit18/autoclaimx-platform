import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { prisma } from '@autoclaimx/db-client';
import { v4 as uuidv4 } from 'uuid';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  async create(dto: CreateTenantDto) {
    const existing = await prisma.tenant.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`Tenant slug "${dto.slug}" already exists`);
    return prisma.tenant.create({
      data: { id: uuidv4(), name: dto.name, slug: dto.slug, plan: dto.plan ?? 'STARTER' },
    });
  }

  findAll() {
    return prisma.tenant.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    return tenant;
  }

  async findBySlug(slug: string) {
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new NotFoundException(`Tenant ${slug} not found`);
    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto) {
    await this.findOne(id);
    const { config, ...rest } = dto;
    return prisma.tenant.update({
      where: { id },
      data: { ...rest, ...(config !== undefined ? { config: config as never } : {}) },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return prisma.tenant.update({ where: { id }, data: { active: false } });
  }
}
