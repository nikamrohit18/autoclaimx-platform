import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request = require('supertest');
import { getToken as getMetricToken } from '@willsoto/nestjs-prometheus';
import { ClaimsController } from '../src/claims/claims.controller';
import { ClaimsService } from '../src/claims/claims.service';
import { MediaService } from '../src/claims/media.service';
import { KafkaService } from '../src/kafka/kafka.service';
import { ClaimsGateway } from '../src/events/claims.gateway';
import {
  METRIC_CLAIMS_CREATED,
  METRIC_CLAIM_STATUS_TRANSITIONS,
} from '../src/metrics/metrics.module';

// ── DB + AWS mocks ────────────────────────────────────────────────────────────
const mockTx = {
  claim: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  claimMedia: { create: jest.fn(), update: jest.fn() },
};

jest.mock('@autoclaimx/db-client', () => ({
  withTenant: jest.fn((_tid: string, fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
  // ClaimStatus is used as a TS type — expose enough for the runtime enum check
  ClaimStatus: {},
  MediaType: {},
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.example.com/presigned-upload-url'),
}));

// S3Client constructor is synchronous and safe; PutObjectCommand is a plain class.
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  PutObjectCommand: jest.fn().mockImplementation((args: unknown) => args),
}));

// ── Dep mocks ─────────────────────────────────────────────────────────────────
const mockKafka = { publish: jest.fn().mockResolvedValue(undefined) };
const mockGateway = { emitStatusChanged: jest.fn() };

// ── Fixtures ──────────────────────────────────────────────────────────────────
const TENANT = 'tenant-1';
const now = new Date().toISOString();
const CLAIM = {
  id: 'clm-1', tenantId: TENANT, claimNumber: 'CLM-001',
  policyNumber: 'POL-123', policyHolderId: 'ph-1',
  vehiclePlate: 'ABC1234', vehicleMake: 'Toyota', vehicleModel: 'Camry', vehicleYear: 2022,
  incidentDate: now, status: 'FNOL_RECEIVED', currency: 'MYR',
  createdAt: now, damageReport: null, fraudScore: null, negotiation: null,
};
const VALID_CLAIM_BODY = {
  policyNumber: 'POL-123', policyHolderId: 'ph-1',
  vehiclePlate: 'ABC1234', vehicleMake: 'Toyota', vehicleModel: 'Camry',
  vehicleYear: 2022, incidentDate: now,
};

// ── Suite ─────────────────────────────────────────────────────────────────────
describe('Claims Service — /api/v1/claims (E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ClaimsController],
      providers: [
        ClaimsService,
        MediaService,
        { provide: KafkaService, useValue: mockKafka },
        { provide: ClaimsGateway, useValue: mockGateway },
        { provide: getMetricToken(METRIC_CLAIMS_CREATED), useValue: { inc: jest.fn() } },
        { provide: getMetricToken(METRIC_CLAIM_STATUS_TRANSITIONS), useValue: { inc: jest.fn() } },
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  // ── POST /claims ─────────────────────────────────────────────────────────────
  describe('POST /api/v1/claims', () => {
    it('201 — creates a claim and returns the record', async () => {
      mockTx.claim.create.mockResolvedValue(CLAIM);

      const res = await request(app.getHttpServer())
        .post('/api/v1/claims')
        .set('x-internal-tenant-id', TENANT)
        .send(VALID_CLAIM_BODY)
        .expect(201);

      expect(res.body.id).toBe('clm-1');
      expect(res.body.claimNumber).toBe('CLM-001');
    });

    it('400 — rejects a claim with a missing vehiclePlate', () =>
      request(app.getHttpServer())
        .post('/api/v1/claims')
        .set('x-internal-tenant-id', TENANT)
        .send({ ...VALID_CLAIM_BODY, vehiclePlate: undefined })
        .expect(400));

    it('400 — rejects vehicleYear outside the valid range', () =>
      request(app.getHttpServer())
        .post('/api/v1/claims')
        .set('x-internal-tenant-id', TENANT)
        .send({ ...VALID_CLAIM_BODY, vehicleYear: 1800 })
        .expect(400));
  });

  // ── GET /claims ──────────────────────────────────────────────────────────────
  describe('GET /api/v1/claims', () => {
    it('200 — returns the paginated claim list', async () => {
      mockTx.claim.findMany.mockResolvedValue([CLAIM]);
      mockTx.claim.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get('/api/v1/claims')
        .set('x-internal-tenant-id', TENANT)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.totalPages).toBe(1);
    });
  });

  // ── GET /claims/:id ──────────────────────────────────────────────────────────
  describe('GET /api/v1/claims/:id', () => {
    it('200 — returns the requested claim', async () => {
      mockTx.claim.findFirst.mockResolvedValue(CLAIM);

      const res = await request(app.getHttpServer())
        .get('/api/v1/claims/clm-1')
        .set('x-internal-tenant-id', TENANT)
        .expect(200);

      expect(res.body.id).toBe('clm-1');
    });

    it('404 — claim not found', async () => {
      mockTx.claim.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/v1/claims/ghost')
        .set('x-internal-tenant-id', TENANT)
        .expect(404);
    });
  });

  // ── POST /claims/:id/media/upload-url ─────────────────────────────────────
  describe('POST /api/v1/claims/:id/media/upload-url', () => {
    it('201 — returns a presigned S3 upload URL', async () => {
      mockTx.claimMedia.create.mockResolvedValue({ id: 'media-1', s3Key: 'key/path.jpg' });

      const res = await request(app.getHttpServer())
        .post('/api/v1/claims/clm-1/media/upload-url')
        .set('x-internal-tenant-id', TENANT)
        .send({ contentType: 'image/jpeg', angleTag: 'FRONT', fileName: 'photo.jpg' })
        .expect(201);

      expect(res.body.uploadUrl).toContain('https://');
    });
  });

  // ── GET /claims/:id/damage-report ─────────────────────────────────────────
  describe('GET /api/v1/claims/:id/damage-report', () => {
    it('200 — returns 200 (no body when damage report not yet processed)', async () => {
      mockTx.claim.findFirst.mockResolvedValue(CLAIM);

      await request(app.getHttpServer())
        .get('/api/v1/claims/clm-1/damage-report')
        .set('x-internal-tenant-id', TENANT)
        .expect(200);
    });
  });

  // ── GET /claims/:id/fraud-score ───────────────────────────────────────────
  describe('GET /api/v1/claims/:id/fraud-score', () => {
    it('200 — returns 200 (no body before first fraud evaluation)', async () => {
      mockTx.claim.findFirst.mockResolvedValue(CLAIM);

      await request(app.getHttpServer())
        .get('/api/v1/claims/clm-1/fraud-score')
        .set('x-internal-tenant-id', TENANT)
        .expect(200);
    });
  });
});
