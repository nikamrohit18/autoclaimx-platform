import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';
import { prisma, withTenant, ClaimStatus } from '@autoclaimx/db-client';
import { KafkaService, KAFKA_TOPICS } from '../kafka/kafka.service';
import { ClaimsGateway } from '../events/claims.gateway';
import { ClaimCreatedPayload, DamageAnalyzedPayload } from '@autoclaimx/shared-types';
import { CreateClaimDto } from './dto/create-claim.dto';
import { v4 as uuidv4 } from 'uuid';
import {
  METRIC_CLAIMS_CREATED,
  METRIC_CLAIM_STATUS_TRANSITIONS,
} from '../metrics/metrics.module';

@Injectable()
export class ClaimsService {
  private readonly logger = new Logger(ClaimsService.name);

  constructor(
    private readonly kafka: KafkaService,
    private readonly gateway: ClaimsGateway,
    @InjectMetric(METRIC_CLAIMS_CREATED) private readonly claimsCreatedCounter: Counter<string>,
    @InjectMetric(METRIC_CLAIM_STATUS_TRANSITIONS) private readonly statusTransitionCounter: Counter<string>,
  ) {}

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
    this.claimsCreatedCounter.inc({ tenant_id: tenantId });
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
          include: { damageReport: true, fraudScore: true, negotiation: { select: { finalAmount: true, currency: true, status: true } } },
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

    const holder = await prisma.user.findUnique({
      where: { id: claim.policyHolderId },
      select: { name: true, phone: true },
    });

    return { ...claim, policyHolderName: holder?.name ?? holder?.phone ?? claim.policyHolderId };
  }

  async updateStatus(tenantId: string, id: string, status: ClaimStatus, fromStatus?: string) {
    const claim = await withTenant(tenantId, (tx) =>
      tx.claim.update({
        where: { id },
        data: { status, ...(status === 'SETTLED' || status === 'CLOSED' ? { closedAt: new Date() } : {}) },
      }),
    );

    this.statusTransitionCounter.inc({ from_status: fromStatus ?? 'unknown', to_status: status });

    await this.kafka.publish(
      KAFKA_TOPICS.AUDIT_EVENT,
      { eventType: 'claim.status_changed', claimId: id, status },
      tenantId,
    );

    this.gateway.emitStatusChanged(id, status);

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

  async getAnalytics(tenantId: string, startDate?: string, endDate?: string) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateFilter = (startDate || endDate)
      ? {
          incidentDate: {
            ...(startDate ? { gte: new Date(startDate) } : {}),
            ...(endDate ? { lte: new Date(endDate) } : {}),
          },
        }
      : {};

    const [statusGroups, recentCount, allFraud, agreedSessions, totalNegotiations, topRisk] = await withTenant(
      tenantId,
      (tx) =>
        Promise.all([
          tx.claim.groupBy({ by: ['status'], where: { tenantId, ...dateFilter }, _count: { _all: true } }),
          startDate || endDate
            ? tx.claim.count({ where: { tenantId, ...dateFilter } })
            : tx.claim.count({ where: { tenantId, createdAt: { gte: thirtyDaysAgo } } }),
          tx.fraudScore.findMany({ where: { tenantId, claim: Object.keys(dateFilter).length ? dateFilter : undefined }, select: { riskLevel: true } }),
          tx.negotiationSession.findMany({
            where: { tenantId, status: 'AGREED', claim: Object.keys(dateFilter).length ? dateFilter : undefined },
            select: { finalAmount: true, workshopEstimate: { select: { total: true } } },
          }),
          tx.negotiationSession.count({ where: { tenantId, claim: Object.keys(dateFilter).length ? dateFilter : undefined } }),
          tx.fraudScore.findMany({
            where: { tenantId, riskLevel: { in: ['HIGH', 'CRITICAL'] }, claim: Object.keys(dateFilter).length ? dateFilter : undefined },
            orderBy: { totalScore: 'desc' },
            take: 5,
            include: { claim: { select: { claimNumber: true, status: true } } },
          }),
        ]),
    );

    const statusCounts: Record<string, number> = {};
    for (const g of statusGroups) {
      statusCounts[g.status] = g._count._all;
    }
    const totalClaims = Object.values(statusCounts).reduce((a, b) => a + b, 0);

    const highRisk = allFraud.filter((f) => f.riskLevel === 'HIGH' || f.riskLevel === 'CRITICAL').length;

    let totalSavingsPct = 0;
    let savingsCount = 0;
    for (const n of agreedSessions) {
      const estTotal = Number(n.workshopEstimate?.total ?? 0);
      const finalAmt = Number(n.finalAmount ?? 0);
      if (estTotal > 0 && finalAmt > 0) {
        totalSavingsPct += (estTotal - finalAmt) / estTotal;
        savingsCount++;
      }
    }

    return {
      totalClaims,
      claimsLast30Days: recentCount,
      hasDateFilter: !!(startDate || endDate),
      statusCounts,
      fraudStats: {
        withScore: allFraud.length,
        highRisk,
        detectionRate: allFraud.length > 0 ? +((highRisk / allFraud.length) * 100).toFixed(1) : 0,
      },
      negotiationStats: {
        total: totalNegotiations,
        agreed: agreedSessions.length,
        avgSavingsPct: savingsCount > 0 ? +(totalSavingsPct / savingsCount * 100).toFixed(1) : 0,
      },
      topRiskClaims: topRisk.map((f) => ({
        claimId: f.claimId,
        claimNumber: f.claim.claimNumber,
        status: f.claim.status,
        riskLevel: f.riskLevel,
        totalScore: +(Number(f.totalScore) * 100).toFixed(0),
      })),
    };
  }
}
