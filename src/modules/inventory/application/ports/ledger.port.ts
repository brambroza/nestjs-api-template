import type { StockMovementSnapshot } from '../../domain';

export const INVENTORY_LEDGER = Symbol('INVENTORY_LEDGER');

/** One `post` call = one GL entry (receipt, issue or adjustment). */
export interface InventoryPostingBatch {
  readonly warehouseId: string;
  readonly referenceType: string;
  readonly referenceId: string;
  readonly currency: string;
  readonly movements: readonly StockMovementSnapshot[];
}

/** T-351: stock valuation → GL, inside the same transaction. */
export interface InventoryLedger {
  movementsPosted(batch: InventoryPostingBatch): Promise<void>;
}
