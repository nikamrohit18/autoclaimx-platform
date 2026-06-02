import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// ── DB mock ────────────────────────────────────────────────────────────────────
const mockTx = {
  user: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('@autoclaimx/db-client', () => ({
  withTenant: jest.fn((_tenantId: string, fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
}));

jest.mock('bcryptjs', () => ({ hash: jest.fn().mockResolvedValue('hashed-password') }));

import * as bcrypt from 'bcryptjs';

// ── Fixtures ───────────────────────────────────────────────────────────────────
const USER_RECORD = {
  id: 'u1',
  tenantId: 't1',
  name: 'Aida',
  role: 'ADJUSTER',
  email: 'aida@stellar.com',
  phone: null,
  workshopId: null,
  active: true,
  lastLoginAt: null,
  createdAt: new Date(),
};

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('UsersService', () => {
  let service: UsersService;

  beforeEach(() => {
    service = new UsersService();
    jest.clearAllMocks();
  });

  // ── create ───────────────────────────────────────────────────────────────────
  describe('create', () => {
    it('hashes the password and creates a user record', async () => {
      mockTx.user.create.mockResolvedValue(USER_RECORD);
      const dto: CreateUserDto = { name: 'Aida', role: 'ADJUSTER', email: 'aida@stellar.com', password: 'Secret@123' };

      const result = await service.create('t1', dto);

      expect(bcrypt.hash).toHaveBeenCalledWith('Secret@123', 12);
      expect(mockTx.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ passwordHash: 'hashed-password' }) }),
      );
      expect(result.name).toBe('Aida');
    });

    it('creates a user without a password hash when password is omitted', async () => {
      mockTx.user.create.mockResolvedValue({ ...USER_RECORD, role: 'POLICYHOLDER' });
      const dto: CreateUserDto = { name: 'Ali', role: 'POLICYHOLDER', email: 'ali@example.com' };

      await service.create('t1', dto);

      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(mockTx.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ passwordHash: undefined }) }),
      );
    });
  });

  // ── findAll ──────────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('returns all users for the tenant ordered by createdAt desc', async () => {
      mockTx.user.findMany.mockResolvedValue([USER_RECORD]);

      const result = await service.findAll('t1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('u1');
      expect(mockTx.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 't1' }, orderBy: { createdAt: 'desc' } }),
      );
    });
  });

  // ── findOne ──────────────────────────────────────────────────────────────────
  describe('findOne', () => {
    it('returns the user when found', async () => {
      mockTx.user.findFirst.mockResolvedValue(USER_RECORD);
      const result = await service.findOne('t1', 'u1');
      expect(result.id).toBe('u1');
    });

    it('throws NotFoundException when user is not found', async () => {
      mockTx.user.findFirst.mockResolvedValue(null);
      await expect(service.findOne('t1', 'ghost')).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ───────────────────────────────────────────────────────────────────
  describe('update', () => {
    it('updates and returns the user record', async () => {
      const updated = { ...USER_RECORD, name: 'Aida Binti Ali' };
      mockTx.user.findFirst.mockResolvedValue(USER_RECORD); // findOne guard
      mockTx.user.update.mockResolvedValue(updated);

      const dto: UpdateUserDto = { name: 'Aida Binti Ali' };
      const result = await service.update('t1', 'u1', dto);

      expect(result.name).toBe('Aida Binti Ali');
      expect(mockTx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' } }),
      );
    });

    it('throws NotFoundException when the target user does not exist', async () => {
      mockTx.user.findFirst.mockResolvedValue(null);
      await expect(service.update('t1', 'ghost', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });
});
