import { AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { Action, AppAbility, createAppAbility } from './ability';

export interface PermissionRuleLike {
  readonly action: string;
  readonly subject: string;
  readonly inverted?: boolean;
}

/**
 * Builds a CASL ability from a raw list of permission rules — loaded
 * from Role.permissionsJson via UserPermissionsProvider. This factory
 * no longer hardcodes any role → previously the mapping lived here
 * and required a redeploy; now admins edit the JSON in the DB.
 *
 * A rule with subject "all" and action "manage" is the "admin
 * everything" grant. A rule with `inverted: true` is a deny (CASL
 * `cannot`).
 */
@Injectable()
export class AbilityFactory {
  fromRules(rules: readonly PermissionRuleLike[]): AppAbility {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(
      createAppAbility,
    );
    for (const rule of rules) {
      const action = rule.action as Action;
      const subject = rule.subject as Parameters<typeof can>[1];
      if (rule.inverted) {
        cannot(action, subject);
      } else {
        can(action, subject);
      }
    }
    return build();
  }
}
