import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { prisma, withTenant, ClaimStatus } from '@autoclaimx/db-client';
import { KafkaService, KAFKA_TOPICS } from '../kafka/kafka.service';
import { ClaimCreatedPayload, DamageAnalyzedPayload } from '@autoclaimx/shared-types';
import { CreateClaimDto } from './dto/create-claim.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ClaimsService {
  private readonly logger = new Logger(ClaimsService.name);

  constructor(private readonly kafka: KafkaService) {}

  async create(tenantId: string, dto: CreateClaimDto) {
    const claimNumber = `CLM-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const claim = await withTenant(tenantId, (tx) =>
      tx.claim.create({
        data: {
          id: uuidv4(),
          tenantId,
          claimNumber,
          policyNumber: dto.policyNumber,
          policyHolderId: dto.policyHolderId,
          vehicleVin: dto.vehicleVin,
          vehiclePlate: dto.vehiclePlate,
          vehicleMake: dto.vehicleMake,
          vehicleModel: dto.vehicleModel,
          vehicleYear: dto.vehicleYear,
          incidentDate: new Date(dto.incidentDate),
          incidentLat: dto.incidentLat,
          incidentLng: dto.incidentLng,
          incidentAddress: dto.incidentAddress,
          incidentDescription: dto.incidentDescription,
          currency: dto.currency ?? 'USD',
        },
      }),
    );

    const payload: ClaimCreatedPayload = {
      claimId: claim.id,
      claimNumber: claim.claimNumber,
      policyHolderId: claim.policyHolderId,
      vehiclePlate: claim.vehiclePlate,
    };

    await this.kafka.publish(KAFKA_TOPICS.CLAIM_CREATED, payload, tenantId);
    this.logger.log(`Created claim ${claim.claimNumber} for tenant ${tenantId}`);

    return claim;
  }

  async findAll(tenantId: string, page = 1, limit = 20, status?: ClaimStatus) {
    const where = { tenantId, ...(status ? { status } : {}) };
    const [items, total] = await withTenant(tenantId, (tx) =>
      Promise.all([
        tx.claim.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: { damageReport: true, fraudScore: true },
        }),
        tx.claim.count({ where }),
      ]),
    );

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(tenantId: string, id: string) {
    const claim = await withTenant(tenantId, (tx) =>
      tx.claim.findFirst({
        where: { id, tenantId },
        include: {
          damageReport: true,
          fraudScore: true,
          negotiation: { include: { offers: { orderBy: { createdAt: 'asc' } } } },
        },
      }),
    );

    if (!claim) throw new NotFoundException(`Claim ${id} not found`);
    return claim;
  }

  async updateStatus(tenantId: string, id: string, status: ClaimStatus) {
    const claim = await withTenant(tenantId, (tx) =>
      tx.claim.update({
        where: { id },
        data: { status, ...(status === 'SETTLED' || status === 'CLOSED' ? { closedAt: new Date() } : {}) },
      }),
    );

    await this.kafka.publish(
      KAFKA_TOPICS.AUDIT_EVENT,
      { eventType: 'claim.status_changed', claimId: id, status },
      tenantId,
    );

    return claim;
  }

  async applyDamageAnalyzed(tenantId: string, payload: DamageAnalyzedPayload) {
    const reportData = {
      processingStatus: 'COMPLETE' as const,
      overallSeverity: payload.overallSeverity,
      totalLossProbability: payload.totalLossProbability,
      estimatedCostMin: payload.estimatedCostMin,
      estimatedCostMax: payload.estimatedCostMax,
      currency: payload.currency,
      processedAt: new Date(),
    };

    await withTenant(tenantId, (tx) =>
      tx.damageReport.upsert({
        where: { claimId: payload.claimId },
        create: { id: uuidv4(), tenantId, claimId: payload.claimId, modelVersion: '', ...reportData },
        update: reportData,
      }),
    );

    await this.updateStatus(tenantId, payload.claimId, 'UNDER_ASSESSMENT');
    this.logger.log(`Damage report applied for claim ${payload.claimId}`);
  }
}
