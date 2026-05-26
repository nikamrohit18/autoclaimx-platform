import { Module } from '@nestjs/common';
import { Controller, Get, Post, Body, Headers } from '@nestjs/common';
import { prisma, withTenant } from '@autoclaimx/db-client';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

class CreateUserDto {
  email?: string;
  phone?: string;
  name!: string;
  role!: 'INSURER_ADMIN' | 'ADJUSTER' | 'WORKSHOP_ADMIN' | 'WORKSHOP_STAFF' | 'FLEET_ADMIN' | 'POLICYHOLDER';
  password?: string;
}

@Controller('users')
class UsersController {
  @Post()
  async create(@Headers('x-internal-tenant-id') tid: string, @Body() dto: CreateUserDto) {
    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 12) : undefined;
    return withTenant(tid, (tx) =>
      tx.user.create({
        data: { id: uuidv4(), tenantId: tid, name: dto.name, role: dto.role, email: dto.email, phone: dto.phone, passwordHash },
        select: { id: true, tenantId: true, name: true, role: true, email: true, phone: true, active: true, createdAt: true },
      }),
    );
  }

  @Get()
  findAll(@Headers('x-internal-tenant-id') tid: string) {
    return withTenant(tid, (tx) =>
      tx.user.findMany({
        where: { tenantId: tid },
        select: { id: true, name: true, role: true, email: true, phone: true, active: true, createdAt: true },
      }),
    );
  }
}

@Module({ controllers: [UsersController] })
export class UsersModule {}
