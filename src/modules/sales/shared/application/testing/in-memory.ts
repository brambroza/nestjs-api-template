import type { Clock } from '../../../../../shared/clock';
import type { DocumentNumberGenerator } from '../../../../../shared/sequence';
import type { TenantContext } from '../../../../../shared/tenant';
import type { TransactionManager } from '../../../../../shared/transaction';
import type {
  DocumentPricing,
  PriceLookupInput,
  PriceLookupResult,
  VatLookupResult,
} from '../ports/pricing.port';
import type {
  CompanyRef,
  CustomerRef,
  ItemRef,
  SalesRefLookup,
} from '../ports/sales-ref-lookup.port';

/** Test doubles shared by the sales sub-module specs. */
export class InMemorySalesRefLookup implements SalesRefLookup {
  readonly companies = new Map<string, CompanyRef>();
  readonly customers = new Map<string, CustomerRef>();
  readonly items = new Map<string, ItemRef>();
  readonly currencies = new Set<string>(['THB', 'USD']);
  readonly warehouses = new Set<string>(['wh-main']);
  async findCompany(_t: string, id: string): Promise<CompanyRef | null> {
    return this.companies.get(id) ?? null;
  }
  async findCustomer(_t: string, id: string): Promise<CustomerRef | null> {
    return this.customers.get(id) ?? null;
  }
  async findItem(_t: string, id: string): Promise<ItemRef | null> {
    return this.items.get(id) ?? null;
  }
  async currencyExists(_t: string, code: string): Promise<boolean> {
    return this.currencies.has(code);
  }
  async warehouseExists(_t: string, id: string): Promise<boolean> {
    return this.warehouses.has(id);
  }
}

export class InMemoryPricing implements DocumentPricing {
  readonly prices = new Map<string, PriceLookupResult>();
  vat: VatLookupResult = {
    taxCodeId: 'tax-vat7',
    taxCode: 'VAT7',
    rateBasisPoints: 700,
  };
  async resolvePrice(input: PriceLookupInput): Promise<PriceLookupResult> {
    const p = this.prices.get(input.itemId);
    if (!p) throw new Error(`no price for ${input.itemId}`);
    return p;
  }
  async resolveVat(): Promise<VatLookupResult> {
    return this.vat;
  }
}

export class FakeNumbers implements DocumentNumberGenerator {
  private n = 0;
  async next(_t: string, prefix: string): Promise<string> {
    this.n += 1;
    return `${prefix}-202609-${String(this.n).padStart(4, '0')}`;
  }
}

export class FakeTx implements TransactionManager {
  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

export class FixedClock implements Clock {
  constructor(public current: Date) {}
  now(): Date {
    return this.current;
  }
}

export function tenantOf(tenantId: string, userId: string): TenantContext {
  return {
    getTenantId: () => tenantId,
    getUserId: () => userId,
    tryGetUserId: () => userId,
  };
}
