import { MovementType } from './movement';
import { InvalidMovementError, ReservationExceedsStockError } from './errors';

/** Projection per (warehouse, item, lot). available = onHand − reserved. */
export interface StockBalanceSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly warehouseId: string;
  readonly itemId: string;
  readonly lotId: string | null;
  readonly uomCode: string;
  readonly onHandQty: bigint;
  readonly reservedQty: bigint;
  readonly version: number;
}

export function availableQty(
  b: Pick<StockBalanceSnapshot, 'onHandQty' | 'reservedQty'>,
): bigint {
  return b.onHandQty - b.reservedQty;
}

/**
 * Applies one movement to a balance. Pure. Callers pre-check
 * availability so they can report *all* shortages of a document at
 * once; this guard is the last line of defence against negative stock.
 * `consumeReserved` = the outbound quantity was previously reserved by
 * the same document, so it leaves both onHand and reserved.
 */
export function applyMovement(
  b: StockBalanceSnapshot,
  type: MovementType,
  quantity: bigint,
  consumeReserved = 0n,
): StockBalanceSnapshot {
  if (quantity <= 0n) throw new InvalidMovementError('quantity must be > 0');
  if (consumeReserved < 0n || consumeReserved > quantity) {
    throw new InvalidMovementError(
      'consumeReserved must be within 0..quantity',
    );
  }
  switch (type) {
    case MovementType.Receipt:
    case MovementType.TransferIn:
    case MovementType.AdjustIn:
      return { ...b, onHandQty: b.onHandQty + quantity };
    case MovementType.Issue:
    case MovementType.TransferOut:
    case MovementType.AdjustOut: {
      const reserved = b.reservedQty - consumeReserved;
      if (reserved < 0n)
        throw new ReservationExceedsStockError(
          'cannot consume more than reserved',
        );
      const onHand = b.onHandQty - quantity;
      if (onHand < 0n || onHand < reserved) {
        throw new ReservationExceedsStockError(
          `only ${availableQty(b).toString()} ${b.uomCode} available, ${quantity.toString()} requested`,
        );
      }
      return { ...b, onHandQty: onHand, reservedQty: reserved };
    }
    case MovementType.Reserve: {
      if (quantity > availableQty(b)) {
        throw new ReservationExceedsStockError(
          `only ${availableQty(b).toString()} ${b.uomCode} available to reserve`,
        );
      }
      return { ...b, reservedQty: b.reservedQty + quantity };
    }
    case MovementType.Unreserve: {
      if (quantity > b.reservedQty) {
        throw new ReservationExceedsStockError(
          'cannot release more than reserved',
        );
      }
      return { ...b, reservedQty: b.reservedQty - quantity };
    }
  }
}

/**
 * FEFO allocation of `quantity` across lot balances (earliest expiry
 * first, then oldest lot). Returns how much comes from each balance;
 * the remainder that could not be covered is `shortfall`.
 */
export function allocateFefo<T extends { readonly available: bigint }>(
  candidates: readonly T[],
  quantity: bigint,
): {
  readonly allocations: ReadonlyArray<{
    readonly source: T;
    readonly qty: bigint;
  }>;
  readonly shortfall: bigint;
} {
  const allocations: Array<{ source: T; qty: bigint }> = [];
  let remaining = quantity;
  for (const c of candidates) {
    if (remaining <= 0n) break;
    if (c.available <= 0n) continue;
    const take = c.available < remaining ? c.available : remaining;
    allocations.push({ source: c, qty: take });
    remaining -= take;
  }
  return { allocations, shortfall: remaining };
}
