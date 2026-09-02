import type { IsoDate } from '../../../shared/domain';

import { InvalidMovementError } from './errors';

export const MovementType = {
  Receipt: 'RECEIPT',
  Issue: 'ISSUE',
  TransferOut: 'TRANSFER_OUT',
  TransferIn: 'TRANSFER_IN',
  Reserve: 'RESERVE',
  Unreserve: 'UNRESERVE',
  AdjustIn: 'ADJUST_IN',
  AdjustOut: 'ADJUST_OUT',
} as const;
export type MovementType = (typeof MovementType)[keyof typeof MovementType];
export function isMovementType(v: string): v is MovementType {
  return (Object.values(MovementType) as string[]).includes(v);
}

/** Movements that add on-hand quantity and open a cost layer. */
export const INBOUND_TYPES: readonly MovementType[] = [
  'RECEIPT',
  'TRANSFER_IN',
  'ADJUST_IN',
];
/** Movements that remove on-hand quantity and consume cost layers. */
export const OUTBOUND_TYPES: readonly MovementType[] = [
  'ISSUE',
  'TRANSFER_OUT',
  'ADJUST_OUT',
];

export function isInbound(t: MovementType): boolean {
  return INBOUND_TYPES.includes(t);
}
export function isOutbound(t: MovementType): boolean {
  return OUTBOUND_TYPES.includes(t);
}

/** Immutable ledger row. quantity > 0 always; the type carries the sign. */
export interface StockMovementSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly warehouseId: string;
  readonly itemId: string;
  readonly itemSku: string;
  readonly lotId: string | null;
  readonly uomCode: string;
  readonly type: MovementType;
  readonly quantity: bigint;
  readonly unitCostMinor: bigint;
  readonly costMinor: bigint;
  readonly currency: string;
  readonly referenceType: string;
  readonly referenceId: string;
  readonly reason: string | null;
  readonly serialNumbers: readonly string[];
  readonly occurredAt: Date;
  readonly createdBy: string;
}

export const REFERENCE_TYPE_RE = /^[A-Z][A-Z0-9_]{2,31}$/;

export function validateMovement(m: StockMovementSnapshot): void {
  if (m.quantity <= 0n) throw new InvalidMovementError('quantity must be > 0');
  if (m.unitCostMinor < 0n || m.costMinor < 0n) {
    throw new InvalidMovementError('cost must be >= 0');
  }
  if (!REFERENCE_TYPE_RE.test(m.referenceType)) {
    throw new InvalidMovementError(
      `referenceType "${m.referenceType}" is not UPPER_SNAKE`,
    );
  }
  if (m.referenceId.trim().length === 0) {
    throw new InvalidMovementError('referenceId is required');
  }
  if ((m.reason?.length ?? 0) > 500) {
    throw new InvalidMovementError('reason must be <= 500 characters');
  }
  if (
    (m.type === MovementType.AdjustIn || m.type === MovementType.AdjustOut) &&
    !(m.reason ?? '').trim()
  ) {
    throw new InvalidMovementError('adjustments need a reason');
  }
}

export interface LotRef {
  readonly lotNumber: string;
  readonly expiryDate: IsoDate | null;
}
