import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { AuthConfig } from '../config/auth.config';

/**
 * The claim shape the API signs and expects. Rotate `sub`/`tenant_id`
 * naming only with a coordinated migration — every issued token must
 * be valid until its ttl expires.
 */
export interface JwtPayload {
  /** User id — becomes AuthenticatedUser.id. */
  readonly sub: string;
  /** Tenant id — becomes AuthenticatedUser.tenantId + CLS `tenantId`. */
  readonly tenant_id: string;
  /** Roles carried in the token. */
  readonly roles: readonly string[];
  readonly iat?: number;
  readonly exp?: number;
  readonly iss?: string;
  readonly aud?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const auth = config.getOrThrow<AuthConfig>('auth');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: auth.jwtSecret,
      issuer: auth.jwtIssuer,
      audience: auth.jwtAudience,
      algorithms: ['HS256'],
    });
  }

  /**
   * Passport calls this after signature + iss/aud/exp verification.
   * Return value becomes `request.user`.
   */
  validate(payload: JwtPayload): JwtPayload {
    return payload;
  }
}
