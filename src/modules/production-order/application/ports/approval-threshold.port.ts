import type { ApprovalThresholdPolicy, TenantId } from '../../domain';

export const APPROVAL_THRESHOLD = Symbol('APPROVAL_THRESHOLD');

/**
 * R2. The per-tenant threshold value lives in config (Phase 4). The
 * application layer only needs a factory returning the policy for
 * the current tenant. Domain never learns which tenant it is dealing
 * with — the aggregate takes a policy object.
 */
export interface ApprovalThresholdProvider {
  forTenant(tenantId: TenantId): Promise<ApprovalThresholdPolicy>;
}
