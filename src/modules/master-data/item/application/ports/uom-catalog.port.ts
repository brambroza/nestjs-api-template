export const UOM_CATALOG_LOOKUP = Symbol('UOM_CATALOG_LOOKUP');

/**
 * Narrow read port so the item module can validate `defaultUomCode`
 * without depending on the UoM module's aggregate. Keeps the two
 * bounded contexts loosely coupled — the UoM module owns the catalog,
 * item just asks "does this code exist and is it active?".
 */
export interface UomCatalogLookup {
  exists(tenantId: string, code: string): Promise<boolean>;
}
