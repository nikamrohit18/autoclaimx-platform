import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request = require('supertest');
import { getToken as getMetricToken } from '@willsoto/nestjs-prometheus';
import { NegotiationController } from '../src/negotiation/negotiation.controller';
import { NegotiationService } from '../src/negotiation/negotiation.service';
import { KafkaService } from '../src/kafka/kafka.service';
import {
  METRIC_NEGOTIATION_ROUNDS,
  METRIC_NEGOTIATION_OUTCOMES,
  METRIC_AI_INFERENCE_DURATION,
} from '../src/metrics/metrics.module';

// ── DB + axios mocks ──────────────────────────────────────────────────────────
const mockAxiosPost = jest.fn();
jest.mock('axios', () => ({
  __esModule: true,
  default: { post: (...args: unknown[]) => mockAxiosPost(...args) },
}));

const mockTx = {
  claim: { findUnique: jest.fn() },
  negotiationSession: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  negotiationOffer: { create: jest.fn() },
  damageReport: { findUnique: jest.fn().mockResolvedValue(null) },
};

jest.mock('@autoclaimx/db-client', () => ({
  withTenant: jest.fn((_tid: string, fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
}));

// ── Dep mocks ─────────────────────────────────────────────────────────────────
const mockKafka = { publish: jest.fn().mockResolvedValue(undefined) };

// ── Fixtures ──────────────────────────────────────────────────────────────────
const TENANT = 'tenant-1';
const BASE_SESSION = {
  id: 'sess-1', claimId: 'clm-1', workshopId: 'ws-1', tenantId: TENANT,
  currentRound: 0, maxRounds: 3, style: 'BALANCED', currency: 'MYR', status: 'PENDING',
  workshop: { name: 'AutoFix KL' },
  workshopEstimate: { lineItems: [], total: 5000, laborTotal: 2000, partsTotal: 3000, currency: 'MYR' },
  offers: [],
};
const AI_OFFER = {
  recommended_total: 4200, currency: 'MYR', line_items: [],
  message: 'We propose MYR 4,200.', confidence: 0.87,
  should_accept: false, should_escalate: false,
  reasoning: 'Within benchmark range.',
};

// ── Suite ─────────────────────────────────────────────────────────────────────
describe('Workshop Service — /api/v1/negotiations (E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [NegotiationController],
      providers: [
        NegotiationService,
        { provide: KafkaService, useValue: mockKafka },
        { provide: getMetricToken(METRIC_NEGOTIATION_ROUNDS), useValue: { inc: jest.fn() } },
        { provide: getMetricToken(METRIC_NEGOTIATION_OUTCOMES), useValue: { inc: jest.fn() } },
        { provide: getMetricToken(METRIC_AI_INFERENCE_DURATION), useValue: { observe: jest.fn() } },
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    mockKafka.publish.mockResolvedValue(undefined);
    mockTx.negotiationSession.update.mockResolvedValue({});
    mockTx.negotiationOffer.create.mockResolvedValue({ id: 'offer-1' });
    mockTx.damageReport.findUnique.mockResolvedValue(null);
    mockAxiosPost.mockResolvedValue({ data: AI_OFFER });
  });

  // ── POST /negotiations ────────────────────────────────────────────────────
  describe('POST /api/v1/negotiations', () => {
    it('201 — starts a negotiation session and runs the first AI offer', async () => {
      mockTx.claim.findUnique.mockResolvedValue({ id: 'clm-1', currency: 'MYR' });
      mockTx.negotiationSession.create.mockResolvedValue(BASE_SESSION);
      mockTx.negotiationSession.findUnique.mockResolvedValue({ ...BASE_SESSION, offers: [] });

      const res = await request(app.getHttpServer())
        .post('/api/v1/negotiations')
        .set('x-internal-tenant-id', TENANT)
        .send({ claimId: 'clm-1', workshopId: 'ws-1', workshopEstimateId: 'est-1' })
        .expect(201);

      expect(res.body.id).toBe('sess-1');
    });

    it('404 — session not found during AI offer generation', async () => {
      mockTx.claim.findUnique.mockResolvedValue({ id: 'clm-1', currency: 'MYR' });
      mockTx.negotiationSession.create.mockResolvedValue(BASE_SESSION);
      // findUnique returns null so generateAiOffer throws NotFoundException
      mockTx.negotiationSession.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/v1/negotiations')
        .set('x-internal-tenant-id', TENANT)
        .send({ claimId: 'clm-1', workshopId: 'ws-1', workshopEstimateId: 'est-1' })
        .expect(404);
    });
  });

  // ── GET /negotiations/claim/:claimId ──────────────────────────────────────
  describe('GET /api/v1/negotiations/claim/:claimId', () => {
    it('200 — returns the negotiation session for a claim', async () => {
      mockTx.negotiationSession.findUnique.mockResolvedValue(BASE_SESSION);

      const res = await request(app.getHttpServer())
        .get('/api/v1/negotiations/claim/clm-1')
        .set('x-internal-tenant-id', TENANT)
        .expect(200);

      expect(res.body.id).toBe('sess-1');
      expect(res.body.claimId).toBe('clm-1');
    });
  });

  // ── GET /negotiations/workshop/:workshopId ────────────────────────────────
  describe('GET /api/v1/negotiations/workshop/:workshopId', () => {
    it('200 — returns sessions for a workshop', async () => {
      mockTx.negotiationSession.findMany.mockResolvedValue([BASE_SESSION]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/negotiations/workshop/ws-1')
        .set('x-internal-tenant-id', TENANT)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].workshopId).toBe('ws-1');
    });
  });

  // ── POST /negotiations/:sessionId/counter ─────────────────────────────────
  describe('POST /api/v1/negotiations/:sessionId/counter', () => {
    it('200 — records workshop counter offer and triggers next AI round', async () => {
      mockTx.negotiationSession.findUnique
        .mockResolvedValueOnce({ ...BASE_SESSION, currentRound: 1 })   // workshopCounter lookup
        .mockResolvedValueOnce({ ...BASE_SESSION, currentRound: 1, offers: [] }); // generateAiOffer lookup

      const res = await request(app.getHttpServer())
        .post('/api/v1/negotiations/sess-1/counter')
        .set('x-internal-tenant-id', TENANT)
        .send({ amount: 4800, message: 'Counter at MYR 4,800' })
        .expect(201);

      // Response is the AI offer result from generateAiOffer
      expect(mockTx.negotiationOffer.create).toHaveBeenCalledTimes(2);
    });
  });
});
