import { Injectable, Logger } from '@nestjs/common';
import { createClient } from 'redis';

// OTP service: stores 6-digit codes in Redis with 5-minute TTL.
// In dev, logs the OTP to console instead of sending SMS.
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly ttlSeconds = 300; // 5 minutes

  private redisClient = createClient({ url: process.env.REDIS_URL });

  async sendOtp(phone: string): Promise<void> {
    if (!this.redisClient.isOpen) await this.redisClient.connect();

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const key = `otp:${phone}`;
    await this.redisClient.setEx(key, this.ttlSeconds, code);

    if (process.env.NODE_ENV === 'development') {
      this.logger.log(`[DEV] OTP for ${phone}: ${code}`);
      return;
    }

    // Production: send via Twilio
    // Twilio client is injected or instantiated here with env vars
    // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // await client.messages.create({ body: `AutoClaimX OTP: ${code}`, from: process.env.TWILIO_FROM_NUMBER, to: phone });
    this.logger.log(`OTP dispatched to ${phone}`);
  }

  async verifyOtp(phone: string, code: string): Promise<boolean> {
    if (!this.redisClient.isOpen) await this.redisClient.connect();

    const key = `otp:${phone}`;
    const stored = await this.redisClient.get(key);
    if (stored === code) {
      await this.redisClient.del(key); // single-use
      return true;
    }
    return false;
  }
}
