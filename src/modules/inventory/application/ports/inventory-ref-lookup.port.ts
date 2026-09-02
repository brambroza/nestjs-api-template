import type { CostingMethod } from '../../domain';

export const INVENTORY_REF_LOOKUP = Symbol('INVENTORY_REF_LOOKUP');

export interface ItemRef {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly defaultUomCode: string;
  /** NONE | LOT | SERIAL */
  readonly trackingPolicy: string;
  readonly shelfLifeDays: number | null;
  readonly isActive: boolean;
}

/** Narrow reads of master data (lookup-port pattern). */
export interface InventoryRefLookup {
  findItem(tenantId: string, itemId: string): Promise<ItemRef | null>;
  findItemBySku(tenantId: string, sku: string): Promise<ItemRef | null>;
  warehouseExists(tenantId: string, warehouseId: string): Promise<boolean>;
  /** Default warehouse of the company's head office (companyId null = any default in the tenant). */
  findDefaultWarehouse(
    tenantId: string,
    companyId: string | null,
  ): Promise<string | null>;
  costingMethod(tenantId: string): Promise<CostingMethod>;
}
