export const BOM_ITEM_LOOKUP = Symbol('BOM_ITEM_LOOKUP');

export interface BomItemRef {
  readonly id: string;
  readonly sku: string;
  readonly defaultUomCode: string;
  readonly isActive: boolean;
}

export interface BomItemLookup {
  findById(tenantId: string, itemId: string): Promise<BomItemRef | null>;
  findByIds(
    tenantId: string,
    itemIds: readonly string[],
  ): Promise<ReadonlyMap<string, BomItemRef>>;
}
