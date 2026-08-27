import {
  OptimisticLockError,
  OrderId,
  ProductionOrder,
  type ProductionOrderSnapshot,
  type TenantId,
} from '../../domain';
import type { ProductionOrderRepository } from '../ports/production-order.repository';
import type { TenantContext } from '../ports/tenant-context.port';

/**
 * In-memory repository that behaves like a real transactional store:
 * writes go to a per-tx staging area, `commit` merges, `rollback` throws
 * them away. Optimistic lock is enforced against the effective view
 * (committed + own staging). Tenant scope (R10) is filtered by the
 * TenantContext exactly the way a Prisma `$extends` middleware would.
 */
export class InMemoryProductionOrderRepository implements ProductionOrderRepository {
  private readonly committed = new Map<string, ProductionOrderSnapshot>();
  private staging: Map<string, ProductionOrderSnapshot> | null = null;

  constructor(private readonly tenantContext: TenantContext) {}

  /** Test seeding — writes directly to the committed store. */
  seed(order: ProductionOrder): void {
    this.committed.set(order.id, order.snapshot());
  }

  /** Test read helper — bypasses tenant filter, for assertions. */
  peek(id: OrderId): ProductionOrderSnapshot | null {
    return this.committed.get(id) ?? null;
  }

  beginTx(): void {
    if (this.staging) {
      throw new Error(
        'InMemoryProductionOrderRepository does not support nested tx',
      );
    }
    this.staging = new Map();
  }

  commitTx(): void {
    if (this.staging) {
      for (const [id, snap] of this.staging) {
        this.committed.set(id, snap);
      }
      this.staging = null;
    }
  }

  rollbackTx(): void {
    this.staging = null;
  }

  private effective(id: string): ProductionOrderSnapshot | undefined {
    return this.staging?.get(id) ?? this.committed.get(id);
  }

  private tenantFilter(snap: ProductionOrderSnapshot): boolean {
    return snap.tenantId === this.tenantContext.getTenantId();
  }

  async findById(id: OrderId): Promise<ProductionOrder | null> {
    const snap = this.effective(id);
    if (!snap) return null;
    if (!this.tenantFilter(snap)) return null;
    return ProductionOrder.fromSnapshot(snap);
  }

  async save(entity: ProductionOrder): Promise<void> {
    const stored = this.effective(entity.id);
    if (stored && stored.version !== entity.version) {
      throw new OptimisticLockError(entity.id, entity.version, stored.version);
    }
    const nextVersion = entity.version + 1;
    const snap: ProductionOrderSnapshot = {
      ...entity.snapshot(),
      version: nextVersion,
    };
    if (this.staging) {
      this.staging.set(entity.id, snap);
    } else {
      this.committed.set(entity.id, snap);
    }
  }

  // Diagnostics used by tests only.
  committedCountForTenant(tenantId: TenantId): number {
    let n = 0;
    for (const snap of this.committed.values()) {
      if (snap.tenantId === tenantId) n++;
    }
    return n;
  }
}
