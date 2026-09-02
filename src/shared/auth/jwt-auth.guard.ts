import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { ClsService } from 'nestjs-cls';

import type { AppClsStore } from '../cls/app-cls-store';
import type { AuthConfig } from '../config/auth.config';

import type { AuthenticatedUser } from './authenticated-user.decorator';
import type { JwtPayload } from './jwt.strategy';

/**
 * Guard tries a real Bearer JWT first (via passport-jwt strategy). If
 * the request has no Bearer token AND `auth.allowHeaderStub` is on
 * (default in non-prod, forced false in production), we accept the
 * template's header stub (X-User-Id/X-Tenant-Id/X-Roles) so a fresh
 * clone works without minting a token.
 *
 * Either way we produce a canonical `request.user: AuthenticatedUser`
 * and seed CLS with tenantId + userId — controllers and use cases
 * see one shape.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') implements CanActivate {
  private readonly allowHeaderStub: boolean;

  constructor(
    private readonly cls: ClsService<AppClsStore>,
    config: ConfigService,
  ) {
    super();
    this.allowHeaderStub =
      config.getOrThrow<AuthConfig>('auth').allowHeaderStub;
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthenticatedUser | JwtPayload;
    }>();

    const bearer = single(req.headers['authorization']);
    if (bearer && bearer.toLowerCase().startsWith('bearer ')) {
      // Delegate to passport-jwt strategy → validate() sets req.user
      // to the JwtPayload. We then canonicalize.
      const ok = (await super.canActivate(context)) as boolean;
      if (!ok) return false;
      const payload = req.user as JwtPayload;
      const user: AuthenticatedUser = {
        id: payload.sub as unknown as AuthenticatedUser['id'],
        tenantId: payload.tenant_id,
        roles: payload.roles ?? [],
      };
      req.user = user;
      this.cls.set('userId', user.id);
      this.cls.set('tenantId', user.tenantId);
      return true;
    }

    if (!this.allowHeaderStub) {
      throw new UnauthorizedException('Bearer token required');
    }

    // Dev/test header stub — never reachable in production because
    // auth.config forces allowHeaderStub=false when APP_ENV=production.
    const userId = single(req.headers['x-user-id']);
    const tenantId = single(req.headers['x-tenant-id']);
    if (!userId || !tenantId) {
      throw new UnauthorizedException(
        'Missing Authorization: Bearer <token> (or X-User-Id + X-Tenant-Id in dev)',
      );
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
