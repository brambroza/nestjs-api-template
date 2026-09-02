export const CATEGORY_LOOKUP = Symbol('CATEGORY_LOOKUP');

/**
 * Narrow read port onto the item-category catalogue. The item module
 * validates `categoryId` on create and maps `categoryCode` -> id during
 * bulk import without depending on the category aggregate.
 */
export interface CategoryLookup {
  exists(tenantId: string, categoryId: string): Promise<boolean>;
  /** code -> id for every code that exists (active only). */
  idsByCodes(
    tenantId: string,
    codes: readonly string[],
  ): Promise<ReadonlyMap<string, string>>;
}
