import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';

// Thin HTTP proxy: forwards authenticated requests to downstream services.
// Each NestJS service handles its own business logic; the gateway only handles
// auth, rate limiting, and routing.
@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  private readonly serviceUrls = {
    claims: process.env.CLAIMS_SERVICE_URL ?? 'http://localhost:3001',
    workshop: process.env.WORKSHOP_SERVICE_URL ?? 'http://localhost:3002',
    admin: process.env.ADMIN_SERVICE_URL ?? 'http://localhost:3003',
  };

  async forward(
    service: keyof typeof this.serviceUrls,
    path: string,
    config: AxiosRequestConfig,
    tenantId: string,
  ) {
    const url = `${this.serviceUrls[service]}${path}`;
    this.logger.debug(`→ ${config.method?.toUpperCase()} ${url}`);

    const response = await axios({
      ...config,
      url,
      headers: {
        ...config.headers,
        'X-Internal-Tenant-ID': tenantId,
        'X-Internal-Service-Secret': process.env.INTERNAL_SERVICE_SECRET,
      },
    });

    return response.data;
  }
}
