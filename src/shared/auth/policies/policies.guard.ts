import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AbilityFactory } from './ability.factory';
import {
  CHECK_POLICIES_KEY,
  type PolicyHandler,
} from './check-policies.decorator';
import type { AuthenticatedUser } from '../authenticated-user.decorator';

/**
 * Reads @CheckPolicies handlers from route metadata, builds an ability
 * for the current user, and asks each handler whether the operation is
 * allowed. Roles are the input; the authority matrix in
 * docs/state-machine.md is the spec.
 */
@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const handlers =
      this.reflector.get<PolicyHandler[]>(
        CHECK_POLICIES_KEY,
        context.getHandler(),
      ) ?? [];
    if (handlers.length === 0) return true;

    const req = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();
    if (!req.user) {
      throw new ForbiddenException('No authenticated user');
    }
    const ability = this.abilityFactory.createForUser(req.user);
    const allowed = handlers.every((h) => h(ability));
    if (!allowed) {
      throw new ForbiddenException(
        'User is not permitted to perform this action',
      );
    }
    return true;
  }
}
