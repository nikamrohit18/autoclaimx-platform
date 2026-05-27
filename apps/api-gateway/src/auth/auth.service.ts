import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { prisma } from '@autoclaimx/db-client';
import * as bcrypt from 'bcryptjs';
import { OtpService } from './otp.service';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  role: string;
  type: 'access' | 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly otpService: OtpService,
  ) {}

  async loginWithPassword(email: string, password: string, tenantSlug: string): Promise<TokenPair> {
    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant || !tenant.active) throw new UnauthorizedException('Invalid credentials');

    const user = await prisma.user.findFirst({
      where: { email, tenantId: tenant.id, active: true },
    });
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    return this.issueTokens({ sub: user.id, tenantId: user.tenantId, role: user.role, type: 'access' });
  }

  async verifyOtpAndIssueTokens(phone: string, code: string): Promise<TokenPair> {
    const valid = await this.otpService.verifyOtp(phone, code);
    if (!valid) throw new UnauthorizedException('Invalid or expired OTP');

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user || !user.active) throw new UnauthorizedException('User not found');

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    return this.issueTokens({ sub: user.id, tenantId: user.tenantId, role: user.role, type: 'access' });
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, { secret: process.env.JWT_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.type !== 'refresh') throw new UnauthorizedException('Not a refresh token');
    return this.issueTokens({ ...payload, type: 'access' });
  }

  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        tenantId: true,
        workshopId: true,
        active: true,
        lastLoginAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private issueTokens(payload: JwtPayload): TokenPair {
    const accessToken = this.jwtService.sign({ ...payload, type: 'access' });
    const refreshToken = this.jwtService.sign(
      { ...payload, type: 'refresh' },
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d' },
    );
    return { accessToken, refreshToken, expiresIn: 3600 };
  }
}
