import {
  All,
  Controller,
  Req,
  UseGuards,
  Param,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { ProxyService } from './proxy.service';

type ServiceName = 'claims' | 'workshop' | 'admin';

const SERVICE_PREFIXES: Record<string, ServiceName> = {
  claims: 'claims',
  workshops: 'workshop',
  tenants: 'admin',
  users: 'admin',
};

@Controller()
@UseGuards(AuthGuard('jwt'))
export class ProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @All(':resource(claims|workshops|tenants|users)/*')
  async proxy(@Req() req: Request & { user: { tenantId: string } }, @Param('resource') resource: string) {
    const service = SERVICE_PREFIXES[resource];
    // Strip the /api/v1 prefix that NestJS added back off, forward the raw path
    const downstreamPath = req.url;

    return this.proxyService.forward(service, downstreamPath, {
      method: req.method,
      data: req.body,
      params: req.query,
      headers: { 'content-type': req.headers['content-type'] },
    }, req.user.tenantId);
  }
}
