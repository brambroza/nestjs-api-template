import type { Clock } from '../../../../../shared/clock';
import type { DocumentNumberGenerator } from '../../../../../shared/sequence';
import type { TenantContext } from '../../../../../shared/tenant';
import type { TransactionManager } from '../../../../../shared/transaction';
import { Quotation, QuotationVersionConflictError } from '../../domain';
import type {
  QuotationOutbox,
  QuotationOutboxEnvelope,
} from '../ports/outbox.port';
import type {
  PriceLookupInput,
  PriceLookupResult,
  QuotationPricing,
  VatLookupResult,
} from '../ports/pricing.port';
import type {
  ListQuotationsFilter,
  ListQuotationsPage,
  QuotationRepository,
} from '../ports/quotation.repository';
import type {
  CompanyRef,
  CustomerRef,
  ItemRef,
  SalesRefLookup,
} from '../ports/sales-ref-lookup.port';

export class InMemoryQuotationRepository implements QuotationRepository {
  readonly rows = new Map<string, Quotation>();

  async findById(tenantId: string, id: string): Promise<Quotation | null> {
    const q = this.rows.get(id);
    return q && q.snapshot().tenantId === tenantId
      ? Quotation.fromSnapshot(q.snapshot())
      : null;
  }
  async findRevisions(
    tenantId: string,
    number: string,
  ): Promise<readonly Quotation[]> {
    return [...this.rows.values()]
      .filter(
        (q) =>
          q.snapshot().tenantId === tenantId && q.snapshot().number === number,
      )
      .sort((a, b) => b.snapshot().revision - a.snapshot().revision);
  }
  async list(
    tenantId: string,
    f: ListQuotationsFilter,
  ): Promise<ListQuotationsPage> {
    const all = [...this.rows.values()].filter((q) => {
      const s = q.snapshot();
      return (
        s.tenantId === tenantId &&
        (!f.status || s.status === f.status) &&
        (!f.customerId || s.customerId === f.customerId)
      );
    });
    return {
      items: all.slice(f.offset, f.offset + f.limit),
      total: all.length,
    };
  }
  async create(q: Quotation): Promise<void> {
    this.rows.set(q.id, q);
  }
  async save(q: Quotation): Promise<Quotation> {
    const stored = this.rows.get(q.id);
    if (!stored || stored.version !== q.version) {
      throw new QuotationVersionConflictError(
        q.id,
        q.version,
        stored?.version ?? -1,
      );
    }
    const next = Quotation.fromSnapshot({
      ...q.snapshot(),
      version: q.version + 1,
    });
    this.rows.set(q.id, next);
    return next;
  }
  async listDueForExpiry(
    onDate: string,
    limit: number,
  ): Promise<readonly Quotation[]> {
    return [...this.rows.values()]
      .filter((q) => q.isDueForExpiry(onDate))
      .slice(0, limit);
  }
}

export class InMemorySalesRefLookup implements SalesRefLookup {
  readonly companies = new Map<string, CompanyRef>();
  readonly customers = new Map<string, CustomerRef>();
  readonly items = new Map<string, ItemRef>();
  readonly currencies = new Set<string>(['THB', 'USD']);
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
}

export class InMemoryPricing implements QuotationPricing {
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

export class InMemoryOutbox implements QuotationOutbox {
  readonly rows: QuotationOutboxEnvelope[] = [];
  async enqueue(envelope: QuotationOutboxEnvelope): Promise<void> {
    this.rows.push(envelope);
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
