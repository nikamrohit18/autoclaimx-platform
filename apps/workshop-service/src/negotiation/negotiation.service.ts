import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { prisma, withTenant } from '@autoclaimx/db-client';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class NegotiationService {
  private readonly logger = new Logger(NegotiationService.name);

  async startSession(tenantId: string, claimId: string, workshopId: string, workshopEstimateId: string) {
    const session = await withTenant(tenantId, (tx) =>
      tx.negotiationSession.create({
        data: {
          id: uuidv4(),
          claimId,
          workshopId,
          workshopEstimateId,
          status: 'PENDING',
          currentRound: 0,
          maxRounds: 3,
          style: 'BALANCED',
          currency: 'USD',
        },
        include: { workshopEstimate: true },
      }),
    );

    // Trigger first AI offer
    await this.generateAiOffer(tenantId, session.id);
    return session;
  }

  async generateAiOffer(tenantId: string, sessionId: string) {
    const session = await withTenant(tenantId, (tx) =>
      tx.negotiationSession.findUnique({
        where: { id: sessionId },
        include: { workshopEstimate: true, offers: { orderBy: { createdAt: 'asc' } } },
      }),
    );

    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);

    const round = session.currentRound + 1;

    // TODO: fetch damage report and benchmark data from claims-service and benchmark DB
    const damageReport = {}; // placeholder
    const benchmarkData = {}; // placeholder

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
      workshop_name: 'Workshop',
      current_round: round,
      max_rounds: session.maxRounds,
      style: session.style,
      currency: session.currency,
      damage_report: damageReport,
      workshop_estimate: session.workshopEstimate?.lineItems ?? {},
      benchmark_data: benchmarkData,
      conversation_history: history,
    });

    await withTenant(tenantId, (tx) =>
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
          ...(nextStatus === 'AGREED' ? { finalAmount: offer.recommended_total, resolvedAt: new Date() } : {}),
        },
      }),
    );

    this.logger.log(`AI offer round ${round} for session ${sessionId}: ${offer.recommended_total}`);
    return offer;
  }

  async workshopCounter(tenantId: string, sessionId: string, amount: number, message: string) {
    const session = await withTenant(tenantId, (tx) =>
      tx.negotiationSession.findUnique({ where: { id: sessionId } }),
    );
    if (!session) throw new NotFoundException('Session not found');

    await withTenant(tenantId, (tx) =>
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

    // Trigger next AI offer
    return this.generateAiOffer(tenantId, sessionId);
  }

  async getSession(tenantId: string, claimId: string) {
    return withTenant(tenantId, (tx) =>
      tx.negotiationSession.findUnique({
        where: { claimId },
        include: { offers: { orderBy: { createdAt: 'asc' } } },
      }),
    );
  }
}
