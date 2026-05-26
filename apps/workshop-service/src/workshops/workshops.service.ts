import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, withTenant } from '@autoclaimx/db-client';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class WorkshopsService {
  async create(tenantId: string, data: { name: string; email?: string; phone?: string; address?: string }) {
    return withTenant(tenantId, (tx) =>
      tx.workshop.create({
        data: { id: uuidv4(), tenantId, ...data },
      }),
    );
  }

  async findAll(tenantId: string) {
    return withTenant(tenantId, (tx) => tx.workshop.findMany({ where: { tenantId, active: true } }));
  }

  async findOne(tenantId: string, id: string) {
    const w = await withTenant(tenantId, (tx) => tx.workshop.findFirst({ where: { id, tenantId } }));
    if (!w) throw new NotFoundException(`Workshop ${id} not found`);
    return w;
  }
}
