import type { Clock } from '../../../../../shared/clock';
import type { TenantContext } from '../../../../../shared/tenant';
import type { TransactionManager } from '../../../../../shared/transaction';
import {
  FiscalYear,
  type Currency,
  type FxRate,
  type IsoDate,
  type ItemTaxOverrideSnapshot,
  type TaxCode,
  type TaxKind,
} from '../../domain';
import type { CurrencyRepository } from '../ports/currency.repository';
import type { FinanceRefLookup } from '../ports/finance-ref-lookup.port';
import type { FiscalYearRepository } from '../ports/fiscal-year.repository';
import type { FetchedFxRate, FxRateSource } from '../ports/fx-rate-source.port';
import type { FxRateRepository } from '../ports/fx-rate.repository';
import type { TaxCodeRepository } from '../ports/tax-code.repository';
import type { TenantDirectory } from '../ports/tenant-directory.port';

export class InMemoryCurrencyRepository implements CurrencyRepository {
  readonly rows: Currency[] = [];
  async findByCode(tenantId: string, code: string): Promise<Currency | null> {
    return (
      this.rows.find(
        (c) => c.snapshot().tenantId === tenantId && c.snapshot().code === code,
      ) ?? null
    );
  }
  async list(
    tenantId: string,
    opts: { readonly activeOnly: boolean },
  ): Promise<readonly Currency[]> {
    return this.rows.filter(
      (c) =>
        c.snapshot().tenantId === tenantId &&
        (!opts.activeOnly || c.snapshot().isActive),
    );
  }
  async create(currency: Currency): Promise<void> {
    this.rows.push(currency);
  }
}

export class InMemoryFxRateRepository implements FxRateRepository {
  readonly rows = new Map<string, FxRate>();
  private key(t: string, b: string, q: string, d: IsoDate): string {
    return `${t}|${b}|${q}|${d}`;
  }
  async findExact(
    t: string,
    b: string,
    q: string,
    d: IsoDate,
  ): Promise<FxRate | null> {
    return this.rows.get(this.key(t, b, q, d)) ?? null;
  }
  async findLatestOnOrBefore(
    t: string,
    b: string,
    q: string,
    d: IsoDate,
  ): Promise<FxRate | null> {
    const candidates = [...this.rows.values()]
      .map((r) => r.snapshot())
      .filter(
        (s) =>
          s.tenantId === t &&
          s.baseCurrency === b &&
          s.quoteCurrency === q &&
          s.rateDate <= d,
      )
      .sort((a, c) => (a.rateDate < c.rateDate ? 1 : -1));
    const best = candidates[0];
    return best
      ? (this.rows.get(this.key(t, b, q, best.rateDate)) ?? null)
      : null;
  }
  async list(): Promise<readonly FxRate[]> {
    return [...this.rows.values()];
  }
  async upsert(rate: FxRate): Promise<void> {
    const s = rate.snapshot();
    this.rows.set(
      this.key(s.tenantId, s.baseCurrency, s.quoteCurrency, s.rateDate),
      rate,
    );
  }
}

export class StubFxRateSource implements FxRateSource {
  constructor(private readonly rates: readonly FetchedFxRate[]) {}
  calls = 0;
  async fetchDaily(): Promise<readonly FetchedFxRate[]> {
    this.calls += 1;
    return this.rates;
  }
}

export class StubTenantDirectory implements TenantDirectory {
  constructor(private readonly ids: readonly string[]) {}
  async listTenantIds(): Promise<readonly string[]> {
    return this.ids;
  }
}

export class InMemoryTaxCodeRepository implements TaxCodeRepository {
  readonly rows = new Map<string, TaxCode>();
  readonly overrides = new Map<string, ItemTaxOverrideSnapshot>();
  async findById(tenantId: string, id: string): Promise<TaxCode | null> {
    const t = this.rows.get(id);
    return t && t.snapshot().tenantId === tenantId ? t : null;
  }
  async findByCode(tenantId: string, code: string): Promise<TaxCode | null> {
    return (
      [...this.rows.values()].find(
        (t) => t.snapshot().tenantId === tenantId && t.snapshot().code === code,
      ) ?? null
    );
  }
  async findDefault(tenantId: string, kind: TaxKind): Promise<TaxCode | null> {
    return (
      [...this.rows.values()].find((t) => {
        const s = t.snapshot();
        return (
          s.tenantId === tenantId &&
          s.kind === kind &&
          s.isDefault &&
          s.isActive
        );
      }) ?? null
    );
  }
  async list(
    tenantId: string,
    opts: { readonly kind?: TaxKind | null; readonly activeOnly: boolean },
  ): Promise<readonly TaxCode[]> {
    return [...this.rows.values()].filter((t) => {
      const s = t.snapshot();
      return (
        s.tenantId === tenantId &&
        (!opts.kind || s.kind === opts.kind) &&
        (!opts.activeOnly || s.isActive)
      );
    });
  }
  async create(taxCode: TaxCode): Promise<void> {
    this.rows.set(taxCode.snapshot().id, taxCode);
  }
  async findOverride(
    tenantId: string,
    itemId: string,
    kind: TaxKind,
  ): Promise<ItemTaxOverrideSnapshot | null> {
    return this.overrides.get(`${tenantId}|${itemId}|${kind}`) ?? null;
  }
  async upsertOverride(o: ItemTaxOverrideSnapshot): Promise<void> {
    this.overrides.set(`${o.tenantId}|${o.itemId}|${o.kind}`, o);
  }
}

export class InMemoryFiscalYearRepository implements FiscalYearRepository {
  readonly rows = new Map<string, FiscalYear>();
  private forCompany(tenantId: string, companyId: string): FiscalYear[] {
    return [...this.rows.values()].filter(
      (y) =>
        y.snapshot().tenantId === tenantId &&
        y.snapshot().companyId === companyId,
    );
  }
  async findById(tenantId: string, id: string): Promise<FiscalYear | null> {
    const y = this.rows.get(id);
    return y && y.snapshot().tenantId === tenantId ? y : null;
  }
  async findByName(
    tenantId: string,
    companyId: string,
    name: string,
  ): Promise<FiscalYear | null> {
    return (
      this.forCompany(tenantId, companyId).find(
        (y) => y.snapshot().name === name,
      ) ?? null
    );
  }
  async listForCompany(
    tenantId: string,
    companyId: string,
  ): Promise<readonly FiscalYear[]> {
    return this.forCompany(tenantId, companyId).sort((a, b) =>
      a.snapshot().startDate < b.snapshot().startDate ? 1 : -1,
    );
  }
  async findCovering(
    tenantId: string,
    companyId: string,
    date: IsoDate,
  ): Promise<FiscalYear | null> {
    return (
      this.forCompany(tenantId, companyId).find(
        (y) => y.periodFor(date) !== null,
      ) ?? null
    );
  }
  async findOverlapping(
    tenantId: string,
    companyId: string,
    start: IsoDate,
    end: IsoDate,
  ): Promise<FiscalYear | null> {
    return (
      this.forCompany(tenantId, companyId).find((y) =>
        y.overlaps(start, end),
      ) ?? null
    );
  }
  async create(year: FiscalYear): Promise<void> {
    this.rows.set(year.snapshot().id, year);
  }
  async save(year: FiscalYear): Promise<void> {
    this.rows.set(year.snapshot().id, FiscalYear.fromSnapshot(year.snapshot()));
  }
}

export class StubFinanceRefLookup implements FinanceRefLookup {
  constructor(
    private readonly items: readonly string[],
    private readonly companies: readonly string[],
  ) {}
  async itemExists(_t: string, itemId: string): Promise<boolean> {
    return this.items.includes(itemId);
  }
  async findCompany(
    _t: string,
    companyId: string,
  ): Promise<{ baseCurrency: string; isActive: boolean } | null> {
    return this.companies.includes(companyId)
      ? { baseCurrency: 'THB', isActive: true }
      : null;
  }
}

export class FixedTenantContext implements TenantContext {
  constructor(
    private readonly tenantId: string,
    private readonly userId: string,
  ) {}
  getTenantId(): string {
    return this.tenantId;
  }
  getUserId(): string {
    return this.userId;
  }
  tryGetUserId(): string | null {
    return this.userId;
  }
}

export class FixedClock implements Clock {
  constructor(private readonly current: Date) {}
  now(): Date {
    return new Date(this.current.getTime());
  }
}

export class AutocommitTransactionManager implements TransactionManager {
  calls = 0;
  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    this.calls += 1;
    return work();
  }
}
