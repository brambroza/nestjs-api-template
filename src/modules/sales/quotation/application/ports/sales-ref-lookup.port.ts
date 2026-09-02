export const SALES_REF_LOOKUP = Symbol('SALES_REF_LOOKUP');

export interface CompanyRef {
  readonly id: string;
  readonly baseCurrency: string;
  readonly isActive: boolean;
}

export interface CustomerRef {
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
  readonly isActive: boolean;
}

/** Narrow reads of master data owned by other modules (pattern: lookup port + direct Prisma adapter). */
export interface SalesRefLookup {
  findCompany(tenantId: string, companyId: string): Promise<CompanyRef | null>;
  findCustomer(
    tenantId: string,
    customerId: string,
  ): Promise<CustomerRef | null>;
  findItem(tenantId: string, itemId: string): Promise<ItemRef | null>;
  currencyExists(tenantId: string, code: string): Promise<boolean>;
}
