import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';

// Coarse-grained resource-level RBAC. Fine-grained row-level control
// is enforced by each downstream service.
const RESOURCE_ROLES: Record<string, string[]> = {
  claims:       ['PLATFORM_ADMIN', 'INSURER_ADMIN', 'ADJUSTER', 'FLEET_ADMIN'],
  workshops:    ['PLATFORM_ADMIN', 'INSURER_ADMIN', 'ADJUSTER', 'WORKSHOP_ADMIN', 'WORKSHOP_STAFF'],
  negotiations: ['PLATFORM_ADMIN', 'INSURER_ADMIN', 'ADJUSTER', 'WORKSHOP_ADMIN', 'WORKSHOP_STAFF'],
  tenants:      ['PLATFORM_ADMIN', 'INSURER_ADMIN'],
  users:        ['PLATFORM_ADMIN', 'INSURER_ADMIN', 'ADJUSTER', 'WORKSHOP_ADMIN', 'WORKSHOP_STAFF'],
};

@Injectable()
export class ResourceRolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: { role: string } }>();
    const role = req.user?.role;
    if (!role) return false;

    // URL: /api/v1/{resource}/...
    const segments = req.url.split('/').filter(Boolean);
    const resource = segments[2]; // ['api', 'v1', resource, ...]

    const allowed = RESOURCE_ROLES[resource];
    if (!allowed) return true; // unknown resource, pass through

    if (!allowed.includes(role)) {
      throw new ForbiddenException(`Role "${role}" cannot access /${resource}`);
    }
    return true;
  }
}
