import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { UserId } from '../../modules/production-order/domain';

export interface AuthenticatedUser {
  readonly id: UserId;
  readonly tenantId: string;
  readonly roles: readonly string[];
}

/**
 * Reads the request-attached user object populated by JwtAuthGuard.
 * Use in a controller as `@CurrentUser() user: AuthenticatedUser`.
 */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!req.user) {
      throw new Error('CurrentUser accessed but no user on request');
    }
    return req.user;
  },
);
