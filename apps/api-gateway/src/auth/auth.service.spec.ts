import 'reflect-metadata';
import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';

// ── DB mock ────────────────────────────────────────────────────────────────────
// Factory is hoisted — define the mock structure inline, then get a reference via require.
jest.mock('@autoclaimx/db-client', () => ({
  prisma: {
    tenant: { findUnique: jest.fn() },
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  },
}));

jest.mock('bcryptjs', () => ({ compare: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockPrisma: {
  tenant: { findUnique: jest.Mock };
  user: { findFirst: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
} = require('@autoclaimx/db-client').prisma;

import * as bcrypt from 'bcryptjs';

// ── Dep mocks ──────────────────────────────────────────────────────────────────
const mockJwt = {
  sign: jest.fn().mockReturnValue('signed-token'),
  verify: jest.fn(),
} as unknown as JwtService;

const mockOtp = {
  sendOtp: jest.fn(),
  verifyOtp: jest.fn(),
} as unknown as OtpService;

// ── Fixtures ───────────────────────────────────────────────────────────────────
const ACTIVE_TENANT = { id: 'tenant-1', slug: 'stellar', active: true };
const ACTIVE_USER = {
  id: 'user-1',
  tenantId: 'tenant-1',
  email: 'adj@stellar.com',
  role: 'ADJUSTER',
  passwordHash: '$2b$12$hashed',
  active: true,
};

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService(mockJwt, mockOtp);
    jest.clearAllMocks();
    (mockJwt.sign as jest.Mock).mockReturnValue('signed-token');
    mockPrisma.user.update.mockResolvedValue({});
  });

  // ── loginWithPassword ────────────────────────────────────────────────────────
  describe('loginWithPassword', () => {
    it('returns a token pair for valid credentials', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(ACTIVE_TENANT);
      mockPrisma.user.findFirst.mockResolvedValue(ACTIVE_USER);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.loginWithPassword('adj@stellar.com', 'Demo@1234', 'stellar');
      expect(result.accessToken).toBe('signed-token');
      expect(result.refreshToken).toBe('signed-token');
      expect(result.expiresIn).toBe(3600);
    });

    it('throws UnauthorizedException when tenant is not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      await expect(service.loginWithPassword('a@b.com', 'pw', 'unknown')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when tenant is inactive', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ ...ACTIVE_TENANT, active: false });
      await expect(service.loginWithPassword('a@b.com', 'pw', 'stellar')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when user is not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(ACTIVE_TENANT);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.loginWithPassword('a@b.com', 'pw', 'stellar')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when password is wrong', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(ACTIVE_TENANT);
      mockPrisma.user.findFirst.mockResolvedValue(ACTIVE_USER);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(service.loginWithPassword('adj@stellar.com', 'wrong', 'stellar')).rejects.toThrow(UnauthorizedException);
    });

    it('updates lastLoginAt on successful login', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(ACTIVE_TENANT);
      mockPrisma.user.findFirst.mockResolvedValue(ACTIVE_USER);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.loginWithPassword('adj@stellar.com', 'Demo@1234', 'stellar');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ lastLoginAt: expect.any(Date) }) }),
      );
    });
  });

  // ── verifyOtpAndIssueTokens ──────────────────────────────────────────────────
  describe('verifyOtpAndIssueTokens', () => {
    const OTP_USER = { id: 'u1', tenantId: 't1', role: 'POLICYHOLDER', active: true };

    it('returns a token pair for a valid OTP', async () => {
      (mockOtp.verifyOtp as jest.Mock).mockResolvedValue(true);
      mockPrisma.user.findUnique.mockResolvedValue(OTP_USER);

      const result = await service.verifyOtpAndIssueTokens('+60123456789', '123456');
      expect(result.accessToken).toBeDefined();
    });

    it('throws UnauthorizedException for an invalid OTP', async () => {
      (mockOtp.verifyOtp as jest.Mock).mockResolvedValue(false);
      await expect(service.verifyOtpAndIssueTokens('+60123456789', '000000')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when user is not found after valid OTP', async () => {
      (mockOtp.verifyOtp as jest.Mock).mockResolvedValue(true);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.verifyOtpAndIssueTokens('+60123456789', '123456')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when user account is inactive', async () => {
      (mockOtp.verifyOtp as jest.Mock).mockResolvedValue(true);
      mockPrisma.user.findUnique.mockResolvedValue({ ...OTP_USER, active: false });
      await expect(service.verifyOtpAndIssueTokens('+60123456789', '123456')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── refreshTokens ────────────────────────────────────────────────────────────
  describe('refreshTokens', () => {
    it('issues a new token pair from a valid refresh token', async () => {
      (mockJwt.verify as jest.Mock).mockReturnValue({
        sub: 'u1',
        tenantId: 't1',
        role: 'ADJUSTER',
        type: 'refresh',
      });
      const result = await service.refreshTokens('valid-refresh-token');
      expect(result.accessToken).toBe('signed-token');
    });

    it('throws UnauthorizedException when an access token is passed as refresh', async () => {
      (mockJwt.verify as jest.Mock).mockReturnValue({
        sub: 'u1',
        tenantId: 't1',
        role: 'ADJUSTER',
        type: 'access',
      });
      await expect(service.refreshTokens('access-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for an expired or invalid token', async () => {
      (mockJwt.verify as jest.Mock).mockImplementation(() => { throw new Error('jwt expired'); });
      await expect(service.refreshTokens('bad-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── getMe ────────────────────────────────────────────────────────────────────
  describe('getMe', () => {
    it('returns the user record for a valid userId', async () => {
      const profile = { id: 'u1', name: 'Rohit', email: 'r@s.com', phone: null, role: 'ADJUSTER', tenantId: 't1', workshopId: null, active: true, lastLoginAt: null };
      mockPrisma.user.findUnique.mockResolvedValue(profile);
      const result = await service.getMe('u1');
      expect(result.id).toBe('u1');
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getMe('ghost')).rejects.toThrow(NotFoundException);
    });
  });
});
