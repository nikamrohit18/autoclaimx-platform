import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { NegotiationService } from './negotiation.service';
import { KafkaService } from '../kafka/kafka.service';
import { Counter, Histogram } from 'prom-client';

// ── Axios mock ─────────────────────────────────────────────────────────────────
const mockAxiosPost = jest.fn();
jest.mock('axios', () => ({
  __esModule: true,
  default: { post: (...args: unknown[]) => mockAxiosPost(...args) },
}));

// ── DB mock ────────────────────────────────────────────────────────────────────
const mockTx = {
  claim: { findUnique: jest.fn() },
  negotiationSession: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
  negotiationOffer: { create: jest.fn() },
  damageReport: { findUnique: jest.fn().mockResolvedValue(null) },
};

jest.mock('@autoclaimx/db-client', () => ({
  withTenant: jest.fn((_tenantId: string, fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
}));

// ── Dep mocks ──────────────────────────────────────────────────────────────────
const mockKafka = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as KafkaService;
const mockRoundsCounter = { inc: jest.fn() } as unknown as Counter<string>;
const mockOutcomesCounter = { inc: jest.fn() } as unknown as Counter<string>;
const mockAiHistogram = { observe: jest.fn() } as unknown as Histogram<string>;

// ── Fixtures ───────────────────────────────────────────────────────────────────
const BASE_SESSION = {
  id: 'sess-1',
  claimId: 'c1',
  workshopId: 'w1',
  currentRound: 0,
  maxRounds: 3,
  style: 'BALANCED',
  currency: 'MYR',
  status: 'PENDING',
  workshop: { name: 'AutoFix KL' },
  workshopEstimate: { lineItems: [], total: 5000, laborTotal: 2000, partsTotal: 3000, currency: 'MYR' },
  offers: [],
};

const AI_OFFER_RESPONSE = {
  recommended_total: 4200,
  line_items: [],
  message: 'We propose MYR 4200.',
  confidence: 0.85,
  should_accept: false,
  should_escalate: false,
  reasoning: 'Within benchmark range.',
};

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('NegotiationService', () => {
  let service: NegotiationService;

  beforeEach(() => {
    service = new NegotiationService(mockKafka, mockRoundsCounter, mockOutcomesCounter, mockAiHistogram);
    jest.clearAllMocks();
    (mockKafka.publish as jest.Mock).mockResolvedValue(undefined);
    mockTx.negotiationSession.update.mockResolvedValue({});
    mockTx.negotiationOffer.create.mockResolvedValue({ id: 'offer-1' });
    mockTx.damageReport.findUnique.mockResolvedValue(null);
  });

  // ── generateAiOffer ──────────────────────────────────────────────────────────
  describe('generateAiOffer', () => {
    it('creates an AI offer record and publishes a Kafka event (OFFER_SENT)', async () => {
      mockTx.negotiationSession.findUnique.mockResolvedValue({ ...BASE_SESSION });
      mockAxiosPost.mockResolvedValue({ data: AI_OFFER_RESPONSE });

      await service.generateAiOffer('t1', 'sess-1');

      expect(mockTx.negotiationOffer.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ offerer: 'AI', amount: 4200 }) }),
      );
      expect(mockKafka.publish).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ offerer: 'AI', sessionStatus: 'OFFER_SENT' }),
        't1',
      );
    });

    it('sets session status to AGREED when LLM says should_accept=true', async () => {
      mockTx.negotiationSession.findUnique.mockResolvedValue({ ...BASE_SESSION });
      mockAxiosPost.mockResolvedValue({ data: { ...AI_OFFER_RESPONSE, should_accept: true, should_escalate: false } });

      await service.generateAiOffer('t1', 'sess-1');

      expect(mockTx.negotiationSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'AGREED' }) }),
      );
      expect(mockOutcomesCounter.inc).toHaveBeenCalledWith({ outcome: 'AGREED' });
    });

    it('sets session status to ESCALATED when LLM says should_escalate=true', async () => {
      mockTx.negotiationSession.findUnique.mockResolvedValue({ ...BASE_SESSION, currentRound: 2 });
      mockAxiosPost.mockResolvedValue({ data: { ...AI_OFFER_RESPONSE, should_accept: false, should_escalate: true } });

      await service.generateAiOffer('t1', 'sess-1');

      expect(mockTx.negotiationSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'ESCALATED' }) }),
      );
      expect(mockOutcomesCounter.inc).toHaveBeenCalledWith({ outcome: 'ESCALATED' });
    });

    it('throws NotFoundException when session does not exist', async () => {
      mockTx.negotiationSession.findUnique.mockResolvedValue(null);
      await expect(service.generateAiOffer('t1', 'ghost-sess')).rejects.toThrow(NotFoundException);
    });

    it('increments the rounds counter with correct offerer label', async () => {
      mockTx.negotiationSession.findUnique.mockResolvedValue({ ...BASE_SESSION });
      mockAxiosPost.mockResolvedValue({ data: AI_OFFER_RESPONSE });

      await service.generateAiOffer('t1', 'sess-1');

      expect(mockRoundsCounter.inc).toHaveBeenCalledWith({ offerer: 'AI', style: 'BALANCED' });
    });

    it('records AI inference duration in histogram', async () => {
      mockTx.negotiationSession.findUnique.mockResolvedValue({ ...BASE_SESSION });
      mockAxiosPost.mockResolvedValue({ data: AI_OFFER_RESPONSE });

      await service.generateAiOffer('t1', 'sess-1');

      expect(mockAiHistogram.observe).toHaveBeenCalledWith(
        { service: 'negotiation-llm' },
        expect.any(Number),
      );
    });

    it('advances round number by 1 each call', async () => {
      mockTx.negotiationSession.findUnique.mockResolvedValue({ ...BASE_SESSION, currentRound: 1 });
      mockAxiosPost.mockResolvedValue({ data: AI_OFFER_RESPONSE });
      mockTx.negotiationOffer.create.mockResolvedValue({ id: 'offer-2' });

      await service.generateAiOffer('t1', 'sess-1');

      expect(mockTx.negotiationOffer.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ round: 2 }) }),
      );
    });
  });

  // ── workshopCounter ──────────────────────────────────────────────────────────
  describe('workshopCounter', () => {
    it('saves the workshop counter offer, publishes Kafka event, then calls generateAiOffer', async () => {
      const session = { ...BASE_SESSION, id: 'sess-1', claimId: 'c1', currentRound: 1, currency: 'MYR' };
      mockTx.negotiationSession.findUnique
        .mockResolvedValueOnce(session)    // workshopCounter lookup
        .mockResolvedValueOnce({ ...BASE_SESSION, currentRound: 1, offers: [] }); // generateAiOffer lookup

      mockTx.negotiationOffer.create.mockResolvedValue({ id: 'counter-1' });
      mockAxiosPost.mockResolvedValue({ data: AI_OFFER_RESPONSE });

      await service.workshopCounter('t1', 'sess-1', 4800, 'Counter at MYR 4800');

      expect(mockTx.negotiationOffer.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ offerer: 'WORKSHOP', amount: 4800 }) }),
      );
      expect(mockKafka.publish).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ offerer: 'WORKSHOP', amount: 4800 }),
        't1',
      );
    });

    it('throws NotFoundException when session does not exist', async () => {
      mockTx.negotiationSession.findUnique.mockResolvedValue(null);
      await expect(service.workshopCounter('t1', 'ghost', 5000, 'offer')).rejects.toThrow(NotFoundException);
    });
  });
});
