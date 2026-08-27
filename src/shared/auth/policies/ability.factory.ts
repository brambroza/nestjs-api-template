import { AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import type { AuthenticatedUser } from '../authenticated-user.decorator';

import { Action, AppAbility, createAppAbility } from './ability';

/**
 * Builds a CASL ability for the current user. Roles drive the rules;
 * the state-machine authority matrix in docs/state-machine.md is
 * the spec this factory implements. Any change here must also update
 * that document.
 */
@Injectable()
export class AbilityFactory {
  createForUser(user: AuthenticatedUser): AppAbility {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(
      createAppAbility,
    );

    if (user.roles.includes('admin')) {
      can(Action.Manage, 'all');
      return build();
    }

    if (user.roles.includes('creator')) {
      can(Action.Create, 'ProductionOrder');
      can(Action.Submit, 'ProductionOrderSubmit');
      can(Action.Cancel, 'ProductionOrderCancel');
    }

    if (user.roles.includes('approver')) {
      can(Action.Approve, 'ProductionOrderApprove');
      // Segregation of duties is enforced in the domain, not here — the
      // CASL rule opens the door; the aggregate slams it shut for the
      // one specific "own order" case.
    }

    if (user.roles.includes('planner')) {
      can(Action.Release, 'ProductionOrderRelease');
      can(Action.Cancel, 'ProductionOrderCancel');
    }

    if (user.roles.includes('shopfloor')) {
      can(Action.ReportProgress, 'ProductionOrderReport');
    }

    // Read is available to any authenticated user in the same tenant —
    // tenant scoping happens in the repository (R10), not here.
    can(Action.Read, 'ProductionOrder');

    cannot(Action.Manage, 'all');

    return build();
  }
}
