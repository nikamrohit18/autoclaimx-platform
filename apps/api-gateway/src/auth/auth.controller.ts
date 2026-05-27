import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { LoginDto, OtpRequestDto, OtpVerifyDto, RefreshDto } from './auth.dto';

interface AuthUser {
  userId: string;
  tenantId: string;
  role: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.loginWithPassword(dto.email, dto.password, dto.tenantSlug);
  }

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  async requestOtp(@Body() dto: OtpRequestDto) {
    await this.otpService.sendOtp(dto.phone);
    return { message: 'OTP sent' };
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() dto: OtpVerifyDto) {
    return this.authService.verifyOtpAndIssueTokens(dto.phone, dto.code);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  me(@Req() req: Request & { user: AuthUser }) {
    return this.authService.getMe(req.user.userId);
  }
}
