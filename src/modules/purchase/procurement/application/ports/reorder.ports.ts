import type { ReorderRuleSnapshot } from '../../domain';

export const REORDER_RULE_REPOSITORY = Symbol('REORDER_RULE_REPOSITORY');
export const STOCK_AVAILABILITY_LOOKUP = Symbol('STOCK_AVAILABILITY_LOOKUP');

export interface ReorderRuleRepository {
  findByKey(
    tenantId: string,
    warehouseId: string,
    itemId: string,
  ): Promise<ReorderRuleSnapshot | null>;
  list(
    tenantId: string,
    warehouseId: string | null,
  ): Promise<readonly ReorderRuleSnapshot[]>;
  upsert(rule: ReorderRuleSnapshot): Promise<void>;
  markTriggered(id: string, at: Date): Promise<void>;
  /** Tenant-free (cron): every tenant that has at least one active rule. */
  tenantsWithActiveRules(): Promise<readonly string[]>;
}

/** Read of inv_stock_balance owned by the inventory module (lookup-port pattern, no module import). */
export interface StockAvailabilityLookup {
  availableQty(
    tenantId: string,
    warehouseId: string,
    itemId: string,
  ): Promise<bigint>;
}
