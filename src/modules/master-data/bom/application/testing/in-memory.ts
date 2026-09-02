import type { Clock } from '../../../../../shared/clock';
import type { TenantContext } from '../../../../../shared/tenant';
import type { TransactionManager } from '../../../../../shared/transaction';
import type { Bom } from '../../domain';
import type { BomItemLookup, BomItemRef } from '../ports/bom-item-lookup.port';
import type { BomRepository } from '../ports/bom.repository';

export class InMemoryBomRepository implements BomRepository {
  readonly rows = new Map<string, Bom>();

  async findById(tenantId: string, id: string): Promise<Bom | null> {
    const b = this.rows.get(id);
    return b && b.snapshot().tenantId === tenantId ? b : null;
  }

  async findActiveForItem(
    tenantId: string,
    itemId: string,
  ): Promise<Bom | null> {
    for (const b of this.rows.values()) {
      const s = b.snapshot();
      if (s.tenantId === tenantId && s.itemId === itemId && s.isActive)
        return b;
    }
    return null;
  }

  async listForItem(tenantId: string, itemId: string): Promise<readonly Bom[]> {
    return [...this.rows.values()]
      .filter(
        (b) =>
          b.snapshot().tenantId === tenantId && b.snapshot().itemId === itemId,
      )
      .sort((a, b) => b.snapshot().version - a.snapshot().version);
  }

  async create(bom: Bom): Promise<void> {
    this.rows.set(bom.snapshot().id, bom);
  }

  async save(bom: Bom): Promise<void> {
    this.rows.set(bom.snapshot().id, bom);
  }
}

export class InMemoryBomItemLookup implements BomItemLookup {
  private readonly items = new Map<string, BomItemRef>();

  put(ref: BomItemRef): void {
    this.items.set(ref.id, ref);
  }

  async findById(
    _tenantId: string,
    itemId: string,
  ): Promise<BomItemRef | null> {
    return this.items.get(itemId) ?? null;
  }

  async findByIds(
    _tenantId: string,
    itemIds: readonly string[],
  ): Promise<ReadonlyMap<string, BomItemRef>> {
    const out = new Map<string, BomItemRef>();
    for (const id of itemIds) {
      const ref = this.items.get(id);
      if (ref) out.set(id, ref);
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
