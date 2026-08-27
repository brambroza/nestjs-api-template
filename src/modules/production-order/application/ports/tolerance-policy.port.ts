import type { TenantId, TolerancePolicy } from '../../domain';

export const TOLERANCE_POLICY = Symbol('TOLERANCE_POLICY');

export interface TolerancePolicyProvider {
  forTenant(tenantId: TenantId): Promise<TolerancePolicy>;
}
