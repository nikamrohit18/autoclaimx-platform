import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OtpService } from './otp.service';

export interface JwtPayload {
  sub: string;       // userId
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

  async verifyOtpAndIssueTokens(phone: string, code: string): Promise<TokenPair> {
    const valid = await this.otpService.verifyOtp(phone, code);
    if (!valid) throw new UnauthorizedException('Invalid or expired OTP');

    // TODO: look up or create user by phone in user service
    const userId = `phone:${phone}`; // placeholder until user service is wired
    return this.issueTokens({ sub: userId, tenantId: 'default', role: 'POLICYHOLDER', type: 'access' });
  }

  async loginWithPassword(email: string, _password: string, _tenantSlug: string): Promise<TokenPair> {
    // TODO: verify credentials against admin-service via HTTP
    const userId = `email:${email}`; // placeholder
    return this.issueTokens({ sub: userId, tenantId: 'default', role: 'ADJUSTER', type: 'access' });
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.type !== 'refresh') throw new UnauthorizedException('Not a refresh token');
    return this.issueTokens({ ...payload, type: 'access' });
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
