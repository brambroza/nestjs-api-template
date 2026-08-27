import type { Money } from '../value-objects/money';

/**
 * R2: whether an order requires two distinct approvers.
 * The concrete threshold is a per-tenant number injected as a Money —
 * the domain does not read config.
 */
export interface ApprovalThresholdPolicy {
  requiresDualApproval(totalAmount: Money): boolean;
}

export class SimpleThresholdPolicy implements ApprovalThresholdPolicy {
  constructor(private readonly threshold: Money) {}

  requiresDualApproval(totalAmount: Money): boolean {
    return totalAmount.isGreaterThan(this.threshold);
  }
}
