import { Injectable, NotFoundException } from '@nestjs/common';
import { withTenant } from '@autoclaimx/db-client';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const USER_SELECT = {
  id: true, tenantId: true, name: true, role: true, email: true,
  phone: true, workshopId: true, active: true, lastLoginAt: true, createdAt: true,
};

@Injectable()
export class UsersService {
  async create(tenantId: string, dto: CreateUserDto) {
    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 12) : undefined;
    return withTenant(tenantId, (tx) =>
      tx.user.create({
        data: {
          id: uuidv4(),
          tenantId,
          name: dto.name,
          role: dto.role as never,
          email: dto.email,
          phone: dto.phone,
          workshopId: dto.workshopId,
          passwordHash,
        },
        select: USER_SELECT,
      }),
    );
  }

  findAll(tenantId: string) {
    return withTenant(tenantId, (tx) =>
      tx.user.findMany({ where: { tenantId }, select: USER_SELECT, orderBy: { createdAt: 'desc' } }),
    );
  }

  async findOne(tenantId: string, id: string) {
    const user = await withTenant(tenantId, (tx) =>
      tx.user.findFirst({ where: { id, tenantId }, select: USER_SELECT }),
    );
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async update(tenantId: string, id: string, dto: UpdateUserDto) {
    await this.findOne(tenantId, id);
    return withTenant(tenantId, (tx) =>
      tx.user.update({ where: { id }, data: dto as never, select: USER_SELECT }),
    );
  }
}
