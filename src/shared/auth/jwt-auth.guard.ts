import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import type { AppClsStore } from '../cls/app-cls-store';

import type { AuthenticatedUser } from './authenticated-user.decorator';

/**
 * Header-driven auth for now. The template ships wired to trust
 * `X-User-Id`, `X-Tenant-Id`, and (comma-separated) `X-Roles` so a
 * fresh clone can be used behind a reverse proxy that terminates
 * OAuth/JWT for you. Swap this class for the real
 * `@nestjs/passport` JwtAuthGuard by binding the same token in
 * app.module.ts — no controller or use case changes.
 *
 * Real JWT lands in Phase 5 alongside testcontainers.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly cls: ClsService<AppClsStore>) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthenticatedUser;
    }>();

    const userId = single(req.headers['x-user-id']);
    const tenantId = single(req.headers['x-tenant-id']);
    if (!userId || !tenantId) {
      throw new UnauthorizedException('Missing X-User-Id or X-Tenant-Id');
    }

    const roles = (single(req.headers['x-roles']) ?? '')
      .split(',')
      .map((r) => r.trim())
      .filter((r) => r.length > 0);

    const user: AuthenticatedUser = {
      id: userId as unknown as AuthenticatedUser['id'],
      tenantId,
      roles,
    };
    req.user = user;

    this.cls.set('userId', userId);
    this.cls.set('tenantId', tenantId);

    return true;
  }
}

function single(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  if (Array.isArray(v)) return v[0];
  return v.trim().length === 0 ? undefined : v.trim();
}
