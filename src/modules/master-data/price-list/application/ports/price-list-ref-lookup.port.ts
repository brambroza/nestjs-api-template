export const PRICE_LIST_REF_LOOKUP = Symbol('PRICE_LIST_REF_LOOKUP');

export interface PriceListItemRef {
  readonly id: string;
  readonly sku: string;
  readonly defaultUomCode: string;
  readonly isActive: boolean;
}

/** Narrow reads onto item / customer / uom so this module owns no other aggregate. */
export interface PriceListRefLookup {
  findItem(tenantId: string, itemId: string): Promise<PriceListItemRef | null>;
  customerExists(tenantId: string, customerId: string): Promise<boolean>;
  uomExists(tenantId: string, uomCode: string): Promise<boolean>;
}
