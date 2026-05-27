import { All, Controller, Param, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { ProxyService } from './proxy.service';

type ServiceName = 'claims' | 'workshop' | 'admin';

const SERVICE_MAP: Record<string, ServiceName> = {
  claims: 'claims',
  workshops: 'workshop',
  tenants: 'admin',
  users: 'admin',
};

@Controller()
@UseGuards(AuthGuard('jwt'))
export class ProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  // Matches both /claims and /claims/anything/nested
  @All([
    ':resource(claims|workshops|tenants|users)',
    ':resource(claims|workshops|tenants|users)/*',
  ])
  proxy(
    @Req() req: Request & { user: { tenantId: string } },
    @Param('resource') resource: string,
  ) {
    const service = SERVICE_MAP[resource];
    // req.url is the full path including /api/v1 prefix and query string.
    // Downstream services use the same prefix, so forward as-is.
    return this.proxyService.forward(service, req.url, {
      method: req.method,
      data: req.body,
      headers: { 'content-type': req.headers['content-type'] },
    }, req.user.tenantId);
  }
}
