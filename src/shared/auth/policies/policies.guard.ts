import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  USER_PERMISSIONS,
  type UserPermissionsProvider,
} from '../../../modules/master-data/user/application/ports/permissions.port';
import type { AuthenticatedUser } from '../authenticated-user.decorator';

import { AbilityFactory } from './ability.factory';
import {
  CHECK_POLICIES_KEY,
  type PolicyHandler,
} from './check-policies.decorator';

/**
 * Loads the user's rules from DB via UserPermissionsProvider (a role
 * change takes effect on the next request — no token refresh needed),
 * builds an ability, and asks each @CheckPolicies handler whether the
 * operation is allowed.
 *
 * A user with no rules (fresh install, missing role assignment) gets
 * denied — same as if all handlers returned false. That's on purpose:
 * silent "no rules -> allowed" is the failure mode that turns a
 * permission bug into a security bug.
 */
@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly abilityFactory: AbilityFactory,
    @Inject(USER_PERMISSIONS)
    private readonly permissions: UserPermissionsProvider,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
    const rules = await this.permissions.forUser(req.user.id);
    const ability = this.abilityFactory.fromRules(rules);
    const allowed = handlers.every((h) => h(ability));
    if (!allowed) {
      throw new ForbiddenException(
        'User is not permitted to perform this action',
      );
    }
    return true;
  }
}
