export const PURCHASE_REF_LOOKUP = Symbol('PURCHASE_REF_LOOKUP');

export interface CompanyRef {
  readonly id: string;
  readonly baseCurrency: string;
  readonly isActive: boolean;
}

export interface VendorRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly paymentTermsDays: number;
  readonly isActive: boolean;
}

export interface ItemRef {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly defaultUomCode: string;
  /** NONE | LOT | SERIAL — goods receipts must capture a lot for LOT items. */
  readonly trackingPolicy: string;
  readonly isActive: boolean;
}

/** Narrow reads of master data owned by other modules (lookup-port pattern). */
export interface PurchaseRefLookup {
  findCompany(tenantId: string, companyId: string): Promise<CompanyRef | null>;
  findVendor(tenantId: string, vendorId: string): Promise<VendorRef | null>;
  findItem(tenantId: string, itemId: string): Promise<ItemRef | null>;
  currencyExists(tenantId: string, code: string): Promise<boolean>;
  warehouseExists(tenantId: string, warehouseId: string): Promise<boolean>;
  /** Company that owns the warehouse (via its branch); null when unknown. */
  findWarehouseCompany(
    tenantId: string,
    warehouseId: string,
  ): Promise<string | null>;
}
