export const FINANCE_REF_LOOKUP = Symbol('FINANCE_REF_LOOKUP');

/** Narrow reads onto item / company so this module owns no other aggregate. */
export interface FinanceRefLookup {
  itemExists(tenantId: string, itemId: string): Promise<boolean>;
  findCompany(
    tenantId: string,
    companyId: string,
  ): Promise<{
    readonly baseCurrency: string;
    readonly isActive: boolean;
  } | null>;
}
