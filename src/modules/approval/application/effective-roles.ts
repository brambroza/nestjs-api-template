import type { Decider } from '../domain';

import type { DelegationRepository } from './ports/delegation.repository';
import type { UserRolesLookup } from './ports/user-roles-lookup.port';

/**
 * A decider is their own roles plus, for every delegation active today
 * that names them as delegate, the delegator's roles (tagged by
 * delegator so the decision can record "on behalf of").
 */
export async function buildDecider(
  tenantId: string,
  userId: string,
  today: string,
  roles: UserRolesLookup,
  delegations: DelegationRepository,
): Promise<Decider> {
  const [ownRoles, active] = await Promise.all([
    roles.rolesOf(tenantId, userId),
    delegations.listActiveTo(tenantId, userId, today),
  ]);
  const delegatedRoles = new Map<string, readonly string[]>();
  for (const d of active) {
    const from = d.snapshot().fromUserId;
    if (!delegatedRoles.has(from)) {
      delegatedRoles.set(from, await roles.rolesOf(tenantId, from));
    }
  }
  return { userId, ownRoles, delegatedRoles };
}

export function allRolesOf(decider: Decider): readonly string[] {
  const out = new Set(decider.ownRoles);
  for (const rs of decider.delegatedRoles.values())
    for (const r of rs) out.add(r);
  return [...out];
}
