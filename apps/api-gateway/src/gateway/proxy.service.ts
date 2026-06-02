import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { CORRELATION_ID_HEADER } from '../common/correlation-id.middleware';

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
    correlationId?: string,
  ) {
    const url = `${this.serviceUrls[service]}${path}`;
    this.logger.debug(`→ ${config.method?.toUpperCase()} ${url}`);

    try {
      const response = await axios({
        ...config,
        url,
        headers: {
          ...config.headers,
          'X-Internal-Tenant-ID': tenantId,
          'X-Internal-Service-Secret': process.env.INTERNAL_SERVICE_SECRET,
          ...(correlationId ? { [CORRELATION_ID_HEADER]: correlationId } : {}),
        },
      });
      return response.data;
    } catch (err) {
      const axiosErr = err as AxiosError;
      if (axiosErr.response) {
        // Downstream returned an HTTP error — forward its status and body
        throw new HttpException(axiosErr.response.data ?? 'Downstream error', axiosErr.response.status);
      }
      if (axiosErr.code === 'ECONNREFUSED' || axiosErr.code === 'ENOTFOUND') {
        this.logger.error(`Service "${service}" unreachable at ${url}`);
        throw new HttpException('Service temporarily unavailable', HttpStatus.SERVICE_UNAVAILABLE);
      }
      this.logger.error(`Unexpected proxy error: ${String(err)}`);
      throw new HttpException('Internal gateway error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
