import {
  tolerancePolicy,
  type TenantId,
  type TolerancePolicy,
} from '../../domain';
import type { TolerancePolicyProvider } from '../ports/tolerance-policy.port';

export class InMemoryTolerancePolicyProvider implements TolerancePolicyProvider {
  private byTenant = new Map<string, TolerancePolicy>();

  set(tenantId: TenantId, policy: TolerancePolicy): void {
    this.byTenant.set(tenantId, policy);
  }

  async forTenant(tenantId: TenantId): Promise<TolerancePolicy> {
    return this.byTenant.get(tenantId) ?? tolerancePolicy(500n, 0n);
  }
}
