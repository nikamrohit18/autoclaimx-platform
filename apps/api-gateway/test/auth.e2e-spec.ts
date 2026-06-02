import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request = require('supertest');
import { AuthModule } from '../src/auth/auth.module';
import { OtpService } from '../src/auth/otp.service';

// Must be set before JwtModule / JwtStrategy are initialised.
process.env.JWT_SECRET = 'e2e-test-jwt-secret-32-chars-long!!';

// ── DB + bcrypt mocks ─────────────────────────────────────────────────────────
jest.mock('@autoclaimx/db-client', () => ({
  prisma: {
    tenant: { findUnique: jest.fn() },
    user: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
  },
}));

jest.mock('bcryptjs', () => ({ compare: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockPrisma: {
  tenant: { findUnique: jest.Mock };
  user: { findFirst: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
} = require('@autoclaimx/db-client').prisma;

import * as bcrypt from 'bcryptjs';

// ── Fixtures ──────────────────────────────────────────────────────────────────
const ACTIVE_TENANT = { id: 'tenant-1', slug: 'stellar', active: true };
const ACTIVE_USER = {
  id: 'user-1', tenantId: 'tenant-1', email: 'adj@stellar.com',
  role: 'ADJUSTER', passwordHash: '$2b$12$hashed', active: true,
};
const OTP_USER = { id: 'u-otp', tenantId: 't1', role: 'POLICYHOLDER', active: true };
const USER_PROFILE = {
  id: 'user-1', name: 'Rohit', email: 'adj@stellar.com', phone: null,
  role: 'ADJUSTER', tenantId: 'tenant-1', workshopId: null, active: true, lastLoginAt: null,
};

const mockOtp = { sendOtp: jest.fn().mockResolvedValue(undefined), verifyOtp: jest.fn() };

// ── Suite ─────────────────────────────────────────────────────────────────────
describe('API Gateway — /api/v1/auth (E2E)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(OtpService)
      .useValue(mockOtp)
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    jwtService = module.get(JwtService);
  });

  afterAll(() => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.update.mockResolvedValue({});
  });

  // ── POST /auth/login ─────────────────────────────────────────────────────────
  describe('POST /api/v1/auth/login', () => {
    it('200 — returns token pair for valid credentials', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(ACTIVE_TENANT);
      mockPrisma.user.findFirst.mockResolvedValue(ACTIVE_USER);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'adj@stellar.com', password: 'Demo@1234', tenantSlug: 'stellar' })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.expiresIn).toBe(3600);
    });

    it('400 — rejects missing tenantSlug', () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'adj@stellar.com', password: 'Demo@1234' })
        .expect(400));

    it('401 — rejects wrong password', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(ACTIVE_TENANT);
      mockPrisma.user.findFirst.mockResolvedValue(ACTIVE_USER);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'adj@stellar.com', password: 'wrong', tenantSlug: 'stellar' })
        .expect(401);
    });

    it('401 — rejects inactive tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ ...ACTIVE_TENANT, active: false });

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'adj@stellar.com', password: 'Demo@1234', tenantSlug: 'stellar' })
        .expect(401);
    });
  });

  // ── POST /auth/otp/request ───────────────────────────────────────────────────
  describe('POST /api/v1/auth/otp/request', () => {
    it('200 — accepts a valid E.164 phone number', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phone: '+60123456789' })
        .expect(200);

      expect(res.body.message).toBe('OTP sent');
      expect(mockOtp.sendOtp).toHaveBeenCalledWith('+60123456789');
    });

    it('400 — rejects a non-E.164 phone number', () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phone: '0123456789' })
        .expect(400));
  });

  // ── POST /auth/otp/verify ────────────────────────────────────────────────────
  describe('POST /api/v1/auth/otp/verify', () => {
    it('200 — returns tokens for a valid OTP', async () => {
      mockOtp.verifyOtp.mockResolvedValue(true);
      mockPrisma.user.findUnique.mockResolvedValue(OTP_USER);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({ phone: '+60123456789', code: '123456' })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
    });

    it('401 — rejects an invalid OTP', async () => {
      mockOtp.verifyOtp.mockResolvedValue(false);

      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({ phone: '+60123456789', code: '000000' })
        .expect(401);
    });
  });

  // ── POST /auth/refresh ───────────────────────────────────────────────────────
  describe('POST /api/v1/auth/refresh', () => {
    it('200 — issues a new token pair from a valid refresh token', async () => {
      const refreshToken = jwtService.sign(
        { sub: 'user-1', tenantId: 'tenant-1', role: 'ADJUSTER', type: 'refresh' },
        { expiresIn: '7d' },
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
    });

    it('401 — rejects an access token used as a refresh token', async () => {
      const accessToken = jwtService.sign({
        sub: 'user-1', tenantId: 'tenant-1', role: 'ADJUSTER', type: 'access',
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: accessToken })
        .expect(401);
    });
  });

  // ── GET /auth/me ─────────────────────────────────────────────────────────────
  describe('GET /api/v1/auth/me', () => {
    it('200 — returns the user profile for a valid JWT', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(USER_PROFILE);
      const token = jwtService.sign({ sub: 'user-1', tenantId: 'tenant-1', role: 'ADJUSTER' });

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.id).toBe('user-1');
    });

    it('401 — rejects requests without a token', () =>
      request(app.getHttpServer()).get('/api/v1/auth/me').expect(401));
  });
});
