import { roundDiv } from '../../../shared/domain';

import { InvalidMovementError } from './errors';

export const CostingMethod = {
  Fifo: 'FIFO',
  WeightedAvg: 'WEIGHTED_AVG',
} as const;
export type CostingMethod = (typeof CostingMethod)[keyof typeof CostingMethod];
export function isCostingMethod(v: string): v is CostingMethod {
  return (Object.values(CostingMethod) as string[]).includes(v);
}

export interface CostLayerSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly warehouseId: string;
  readonly itemId: string;
  readonly lotId: string | null;
  readonly movementId: string;
  readonly receivedAt: Date;
  readonly originalQty: bigint;
  readonly remainingQty: bigint;
  readonly unitCostMinor: bigint;
  readonly currency: string;
}

export interface FifoConsumption {
  readonly costMinor: bigint;
  /** Layers with their new remainingQty (only the ones touched). */
  readonly updated: readonly CostLayerSnapshot[];
  /** Quantity that no layer could cover (stock present without a cost layer = legacy/opening). */
  readonly uncosted: bigint;
}

/** Oldest layer first; layers with zero remaining are skipped. Pure. */
export function consumeFifo(
  layers: readonly CostLayerSnapshot[],
  quantity: bigint,
): FifoConsumption {
  if (quantity <= 0n) throw new InvalidMovementError('quantity must be > 0');
  const ordered = [...layers]
    .filter((l) => l.remainingQty > 0n)
    .sort(
      (a, b) =>
        a.receivedAt.getTime() - b.receivedAt.getTime() ||
        a.id.localeCompare(b.id),
    );
  let remaining = quantity;
  let costMinor = 0n;
  const updated: CostLayerSnapshot[] = [];
  for (const layer of ordered) {
    if (remaining <= 0n) break;
    const take =
      layer.remainingQty < remaining ? layer.remainingQty : remaining;
    costMinor += take * layer.unitCostMinor;
    updated.push({ ...layer, remainingQty: layer.remainingQty - take });
    remaining -= take;
  }
  return { costMinor, updated, uncosted: remaining };
}

export interface AverageCostSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly itemId: string;
  readonly quantity: bigint;
  readonly totalCostMinor: bigint;
  readonly unitCostMinor: bigint;
  readonly currency: string;
  readonly version: number;
}

/** Moving weighted average, unit cost rounded half-up to the minor unit. */
export function applyAverageReceipt(
  avg: AverageCostSnapshot,
  quantity: bigint,
  unitCostMinor: bigint,
): AverageCostSnapshot {
  if (quantity <= 0n) throw new InvalidMovementError('quantity must be > 0');
  const totalQty = avg.quantity + quantity;
  const totalCost = avg.totalCostMinor + quantity * unitCostMinor;
  return {
    ...avg,
    quantity: totalQty,
    totalCostMinor: totalCost,
    unitCostMinor: totalQty === 0n ? 0n : roundDiv(totalCost, totalQty),
  };
}

export function applyAverageIssue(
  avg: AverageCostSnapshot,
  quantity: bigint,
): { readonly next: AverageCostSnapshot; readonly costMinor: bigint } {
  if (quantity <= 0n) throw new InvalidMovementError('quantity must be > 0');
  const issued = quantity > avg.quantity ? avg.quantity : quantity;
  const costMinor = issued * avg.unitCostMinor;
  const remainingQty = avg.quantity - issued;
  const remainingCost = avg.totalCostMinor - costMinor;
  return {
    costMinor,
    next: {
      ...avg,
      quantity: remainingQty,
      totalCostMinor: remainingQty === 0n ? 0n : remainingCost,
      unitCostMinor:
        remainingQty === 0n ? avg.unitCostMinor : avg.unitCostMinor,
    },
  };
}
