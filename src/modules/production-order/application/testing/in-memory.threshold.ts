import {
  Money,
  SimpleThresholdPolicy,
  type ApprovalThresholdPolicy,
  type TenantId,
} from '../../domain';
import type { ApprovalThresholdProvider } from '../ports/approval-threshold.port';

export class InMemoryThresholdProvider implements ApprovalThresholdProvider {
  private byTenant = new Map<string, Money>();

  set(tenantId: TenantId, threshold: Money): void {
    this.byTenant.set(tenantId, threshold);
  }

  async forTenant(tenantId: TenantId): Promise<ApprovalThresholdPolicy> {
    const threshold =
      this.byTenant.get(tenantId) ?? Money.thb(1_000_000_000_00n);
    return new SimpleThresholdPolicy(threshold);
  }
}
