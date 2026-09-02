import { DomainError } from '../../../../shared/errors';

export class InvalidReorderRuleError extends DomainError {
  readonly code = 'PURCHASE.INVALID_REORDER_RULE';
}

export interface ReorderRuleSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly warehouseId: string;
  readonly itemId: string;
  readonly reorderPoint: bigint;
  readonly reorderQty: bigint;
  readonly preferredVendorId: string | null;
  readonly isActive: boolean;
  readonly lastTriggeredAt: Date | null;
  readonly createdAt: Date;
}

/** Days after a trigger during which the same rule stays quiet (the PR is presumably in flight). */
export const REORDER_COOLDOWN_DAYS = 7;

export function validateReorderRule(
  r: Pick<ReorderRuleSnapshot, 'reorderPoint' | 'reorderQty'>,
): void {
  if (r.reorderPoint < 0n)
    throw new InvalidReorderRuleError('reorderPoint must be >= 0');
  if (r.reorderQty <= 0n)
    throw new InvalidReorderRuleError('reorderQty must be > 0');
}

/** T-326: fire when available stock has dropped to the point and the cooldown has passed. */
export function needsReorder(
  rule: ReorderRuleSnapshot,
  availableQty: bigint,
  now: Date,
): boolean {
  if (!rule.isActive) return false;
  if (availableQty > rule.reorderPoint) return false;
  if (rule.lastTriggeredAt === null) return true;
  const cooldownMs = REORDER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() - rule.lastTriggeredAt.getTime() >= cooldownMs;
}
