import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { withTenant } from '@autoclaimx/db-client';
import { NegotiationOfferMadePayload } from '@autoclaimx/shared-types';
import { KafkaService, KAFKA_TOPICS } from '../kafka/kafka.service';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class NegotiationService {
  private readonly logger = new Logger(NegotiationService.name);

  constructor(private readonly kafka: KafkaService) {}

  async startSession(tenantId: string, claimId: string, workshopId: string, workshopEstimateId: string) {
    const claim = await withTenant(tenantId, (tx) => tx.claim.findUnique({ where: { id: claimId } }));
    const currency = claim?.currency ?? 'MYR';

    const session = await withTenant(tenantId, (tx) =>
      tx.negotiationSession.create({
        data: {
          id: uuidv4(),
          tenantId,
          claimId,
          workshopId,
          workshopEstimateId,
          status: 'PENDING',
          currentRound: 0,
          maxRounds: 3,
          style: 'BALANCED',
          currency,
        },
        include: { workshopEstimate: true },
      }),
    );

    await this.generateAiOffer(tenantId, session.id);
    return session;
  }

  async generateAiOffer(tenantId: string, sessionId: string) {
    const session = await withTenant(tenantId, (tx) =>
      tx.negotiationSession.findUnique({
        where: { id: sessionId },
        include: {
          workshop: true,
          workshopEstimate: true,
          offers: { orderBy: { createdAt: 'asc' } },
        },
      }),
    );

    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);

    const round = session.currentRound + 1;

    // Fetch the claim's damage report directly from the shared DB
    const damageReport = await withTenant(tenantId, (tx) =>
      tx.damageReport.findUnique({ where: { claimId: session.claimId } }),
    );

    const history = session.offers.map((o) => ({
      round: String(o.round),
      offerer: o.offerer,
      amount: String(o.amount),
      currency: o.currency,
      message: o.message,
    }));

    const llmUrl = process.env.NEGOTIATION_LLM_URL ?? 'http://localhost:8002';

    const { data: offer } = await axios.post(`${llmUrl}/generate-offer`, {
      claim_id: session.claimId,
      workshop_name: session.workshop.name,
      current_round: round,
      max_rounds: session.maxRounds,
      style: session.style,
      currency: session.currency,
      damage_report: damageReport
        ? {
            overall_severity: damageReport.overallSeverity,
            estimated_cost_min: Number(damageReport.estimatedCostMin),
            estimated_cost_max: Number(damageReport.estimatedCostMax),
            ai_damages: damageReport.aiDamages,
          }
        : {},
      workshop_estimate: session.workshopEstimate
        ? {
            line_items: session.workshopEstimate.lineItems,
            total: Number(session.workshopEstimate.total),
            labor_total: Number(session.workshopEstimate.laborTotal),
            parts_total: Number(session.workshopEstimate.partsTotal),
            currency: session.workshopEstimate.currency,
          }
        : {},
      benchmark_data: {},
      conversation_history: history,
    });

    const savedOffer = await withTenant(tenantId, (tx) =>
      tx.negotiationOffer.create({
        data: {
          id: uuidv4(),
          sessionId,
          round,
          offerer: 'AI',
          amount: offer.recommended_total,
          currency: session.currency,
          breakdown: offer.line_items,
          message: offer.message,
          confidence: offer.confidence,
        },
      }),
    );

    const nextStatus = offer.should_accept ? 'AGREED' : offer.should_escalate ? 'ESCALATED' : 'OFFER_SENT';

    await withTenant(tenantId, (tx) =>
      tx.negotiationSession.update({
        where: { id: sessionId },
        data: {
          currentRound: round,
          status: nextStatus,
          ...(nextStatus === 'AGREED'
            ? { finalAmount: offer.recommended_total, resolvedAt: new Date() }
            : {}),
          ...(nextStatus === 'ESCALATED' ? { resolvedAt: new Date() } : {}),
        },
      }),
    );

    const kafkaPayload: NegotiationOfferMadePayload = {
      claimId: session.claimId,
      negotiationId: sessionId,
      offerId: savedOffer.id,
      round,
      offerer: 'AI',
      amount: offer.recommended_total,
      currency: session.currency,
      sessionStatus: nextStatus,
    };
    await this.kafka.publish(KAFKA_TOPICS.NEGOTIATION_OFFER_MADE, kafkaPayload, tenantId);

    this.logger.log(`AI offer round ${round} for session ${sessionId}: ${offer.recommended_total} (${nextStatus})`);
    return offer;
  }

  async workshopCounter(tenantId: string, sessionId: string, amount: number, message: string) {
    const session = await withTenant(tenantId, (tx) =>
      tx.negotiationSession.findUnique({ where: { id: sessionId } }),
    );
    if (!session) throw new NotFoundException('Session not found');

    const counterOffer = await withTenant(tenantId, (tx) =>
      tx.negotiationOffer.create({
        data: {
          id: uuidv4(),
          sessionId,
          round: session.currentRound,
          offerer: 'WORKSHOP',
          amount,
          currency: session.currency,
          breakdown: [],
          message,
        },
      }),
    );

    await withTenant(tenantId, (tx) =>
      tx.negotiationSession.update({ where: { id: sessionId }, data: { status: 'COUNTER_RECEIVED' } }),
    );

    const workshopPayload: NegotiationOfferMadePayload = {
      claimId: session.claimId,
      negotiationId: sessionId,
      offerId: counterOffer.id,
      round: session.currentRound,
      offerer: 'WORKSHOP',
      amount,
      currency: session.currency,
    };
    await this.kafka.publish(KAFKA_TOPICS.NEGOTIATION_OFFER_MADE, workshopPayload, tenantId);

    return this.generateAiOffer(tenantId, sessionId);
  }

  async getSession(tenantId: string, claimId: string) {
    return withTenant(tenantId, (tx) =>
      tx.negotiationSession.findUnique({
        where: { claimId },
        include: { offers: { orderBy: { createdAt: 'asc' } }, workshop: true },
      }),
    );
  }

  async getSessionsByWorkshop(tenantId: string, workshopId: string) {
    return withTenant(tenantId, (tx) =>
      tx.negotiationSession.findMany({
        where: { workshopId, tenantId },
        include: { offers: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }
}
