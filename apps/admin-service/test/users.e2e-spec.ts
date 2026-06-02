import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request = require('supertest');
import { UsersController } from '../src/users/users.controller';
import { UsersService } from '../src/users/users.service';

// ── DB + bcrypt mocks ─────────────────────────────────────────────────────────
const mockTx = {
  user: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('@autoclaimx/db-client', () => ({
  withTenant: jest.fn((_tid: string, fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
}));

jest.mock('bcryptjs', () => ({ hash: jest.fn().mockResolvedValue('hashed') }));

// ── Fixtures ──────────────────────────────────────────────────────────────────
const TENANT = 'tenant-1';
const USER = {
  id: 'u1', tenantId: TENANT, name: 'Aida Binti Ali', role: 'ADJUSTER',
  email: 'aida@stellar.com', phone: null, workshopId: null,
  active: true, lastLoginAt: null, createdAt: new Date().toISOString(),
};

// ── Suite ─────────────────────────────────────────────────────────────────────
describe('Admin Service — /api/v1/users (E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [UsersService],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  // ── POST /users ─────────────────────────────────────────────────────────────
  describe('POST /api/v1/users', () => {
    it('201 — creates a user and returns the record without passwordHash', async () => {
      mockTx.user.create.mockResolvedValue(USER);

      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('x-internal-tenant-id', TENANT)
        .send({ name: 'Aida Binti Ali', role: 'ADJUSTER', email: 'aida@stellar.com', password: 'Secret@123' })
        .expect(201);

      expect(res.body.id).toBe('u1');
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('400 — rejects an unrecognised role', () =>
      request(app.getHttpServer())
        .post('/api/v1/users')
        .set('x-internal-tenant-id', TENANT)
        .send({ name: 'Aida', role: 'SUPERVILLAIN', email: 'a@a.com' })
        .expect(400));

    it('400 — rejects name shorter than 2 characters', () =>
      request(app.getHttpServer())
        .post('/api/v1/users')
        .set('x-internal-tenant-id', TENANT)
        .send({ name: 'X', role: 'ADJUSTER', email: 'a@a.com' })
        .expect(400));

    it('400 — rejects a non-email address', () =>
      request(app.getHttpServer())
        .post('/api/v1/users')
        .set('x-internal-tenant-id', TENANT)
        .send({ name: 'Aida', role: 'ADJUSTER', email: 'not-an-email' })
        .expect(400));
  });

  // ── GET /users ───────────────────────────────────────────────────────────────
  describe('GET /api/v1/users', () => {
    it('200 — returns the list of users for the tenant', async () => {
      mockTx.user.findMany.mockResolvedValue([USER]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('x-internal-tenant-id', TENANT)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('u1');
    });
  });

  // ── GET /users/:id ──────────────────────────────────────────────────────────
  describe('GET /api/v1/users/:id', () => {
    it('200 — returns the requested user', async () => {
      mockTx.user.findFirst.mockResolvedValue(USER);

      const res = await request(app.getHttpServer())
        .get('/api/v1/users/u1')
        .set('x-internal-tenant-id', TENANT)
        .expect(200);

      expect(res.body.id).toBe('u1');
    });

    it('404 — user not found', async () => {
      mockTx.user.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/v1/users/ghost')
        .set('x-internal-tenant-id', TENANT)
        .expect(404);
    });
  });

  // ── PATCH /users/:id ────────────────────────────────────────────────────────
  describe('PATCH /api/v1/users/:id', () => {
    it('200 — updates and returns the user', async () => {
      const updated = { ...USER, name: 'Aida Updated' };
      mockTx.user.findFirst.mockResolvedValue(USER);
      mockTx.user.update.mockResolvedValue(updated);

      const res = await request(app.getHttpServer())
        .patch('/api/v1/users/u1')
        .set('x-internal-tenant-id', TENANT)
        .send({ name: 'Aida Updated' })
        .expect(200);

      expect(res.body.name).toBe('Aida Updated');
    });

    it('404 — updating a non-existent user', async () => {
      mockTx.user.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/api/v1/users/ghost')
        .set('x-internal-tenant-id', TENANT)
        .send({ name: 'No Such User' })
        .expect(404);
    });
  });
});
