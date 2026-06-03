import { Injectable, NotFoundException } from '@nestjs/common';
import { withTenant, AccreditationStatus } from '@autoclaimx/db-client';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class WorkshopsService {
  async create(tenantId: string, data: { name: string; email?: string; phone?: string; address?: string; registrationNumber?: string }) {
    return withTenant(tenantId, (tx) =>
      tx.workshop.create({
        data: { id: uuidv4(), tenantId, ...data },
      }),
    );
  }

  async findAll(tenantId: string) {
    return withTenant(tenantId, (tx) => tx.workshop.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }));
  }

  async findOne(tenantId: string, id: string) {
    const w = await withTenant(tenantId, (tx) => tx.workshop.findFirst({ where: { id, tenantId } }));
    if (!w) throw new NotFoundException(`Workshop ${id} not found`);
    return w;
  }

  async update(
    tenantId: string,
    id: string,
    data: {
      name?: string;
      email?: string;
      phone?: string;
      address?: string;
      registrationNumber?: string;
      accreditationStatus?: AccreditationStatus;
      active?: boolean;
    },
  ) {
    const w = await withTenant(tenantId, (tx) => tx.workshop.findFirst({ where: { id, tenantId } }));
    if (!w) throw new NotFoundException(`Workshop ${id} not found`);
    return withTenant(tenantId, (tx) => tx.workshop.update({ where: { id }, data }));
  }
}
