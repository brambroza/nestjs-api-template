import type { Clock } from '../../../../../shared/clock';
import type { TenantContext } from '../../../../../shared/tenant';
import type { TransactionManager } from '../../../../../shared/transaction';
import type { Item } from '../../domain';
import type { CategoryLookup } from '../ports/category-lookup.port';
import type {
  ItemRepository,
  ListItemsOptions,
} from '../ports/item.repository';
import type { UomCatalogLookup } from '../ports/uom-catalog.port';

export class InMemoryItemRepository implements ItemRepository {
  readonly rows = new Map<string, Item>();

  async findById(tenantId: string, id: string): Promise<Item | null> {
    const i = this.rows.get(id);
    return i && i.snapshot().tenantId === tenantId ? i : null;
  }

  async findBySku(tenantId: string, sku: string): Promise<Item | null> {
    return (await this.findBySkus(tenantId, [sku]))[0] ?? null;
  }

  async findBySkus(
    tenantId: string,
    skus: readonly string[],
  ): Promise<readonly Item[]> {
    const wanted = new Set(skus.map((s) => s.toUpperCase()));
    return [...this.rows.values()].filter((i) => {
      const s = i.snapshot();
      return s.tenantId === tenantId && wanted.has(s.sku.toUpperCase());
    });
  }

  async list(
    tenantId: string,
    opts: ListItemsOptions,
  ): Promise<{ items: readonly Item[]; total: number }> {
    const all = [...this.rows.values()].filter((i) => {
      const s = i.snapshot();
      return s.tenantId === tenantId && (!opts.activeOnly || s.isActive);
    });
    return {
      items: all.slice(opts.offset, opts.offset + opts.limit),
      total: all.length,
    };
  }

  async create(item: Item): Promise<void> {
    this.rows.set(item.snapshot().id, item);
  }

  async createMany(items: readonly Item[]): Promise<void> {
    for (const i of items) this.rows.set(i.snapshot().id, i);
  }
}

export class InMemoryUomCatalogLookup implements UomCatalogLookup {
  constructor(private readonly codes: readonly string[]) {}
  async exists(_tenantId: string, code: string): Promise<boolean> {
    return this.codes.some((c) => c.toUpperCase() === code.toUpperCase());
  }
}

export class InMemoryCategoryLookup implements CategoryLookup {
  constructor(private readonly byCode: ReadonlyMap<string, string>) {}
  async exists(_tenantId: string, categoryId: string): Promise<boolean> {
    return [...this.byCode.values()].includes(categoryId);
  }
  async idsByCodes(
    _tenantId: string,
    codes: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    const out = new Map<string, string>();
    for (const c of codes) {
      for (const [code, id] of this.byCode) {
        if (code.toUpperCase() === c.toUpperCase()) out.set(code, id);
      }
    }
    return out;
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
