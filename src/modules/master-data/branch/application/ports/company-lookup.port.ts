export const COMPANY_LOOKUP = Symbol('COMPANY_LOOKUP');

export interface CompanyLookupResult {
  readonly isActive: boolean;
}

/**
 * Narrow read port so branch can validate `companyId` without depending
 * on the company aggregate. Returns null when the company does not exist
 * in this tenant — an id from another tenant is indistinguishable from a
 * typo, on purpose (R10: no cross-tenant existence oracle).
 */
export interface CompanyLookup {
  find(
    tenantId: string,
    companyId: string,
  ): Promise<CompanyLookupResult | null>;
}
