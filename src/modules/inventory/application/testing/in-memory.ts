import type { Clock } from '../../../../shared/clock';
import type { IsoDate } from '../../../../shared/domain';
import type { TenantContext } from '../../../../shared/tenant';
import type { TransactionManager } from '../../../../shared/transaction';
import {
  CostingMethod,
  InventoryVersionConflictError,
  StockCount,
  StockTransfer,
  type AverageCostSnapshot,
  type CostLayerSnapshot,
  type CountStatus,
  type LotSnapshot,
  type SerialUnitSnapshot,
  type StockBalanceSnapshot,
  type StockMovementSnapshot,
  type TransferStatus,
} from '../../domain';
import type { CountRepository } from '../ports/count.repository';
import type {
  InventoryRefLookup,
  ItemRef,
} from '../ports/inventory-ref-lookup.port';
import type {
  InventoryOutbox,
  InventoryOutboxEnvelope,
} from '../ports/outbox.port';
import type {
  BalanceWithLot,
  CostRepository,
  LotRepository,
  LotWithStock,
  MovementFilter,
  ReservationRepository,
  ReservationSnapshot,
  SerialRepository,
  StockBalanceRepository,
  StockMovementRepository,
  TransferRepository,
} from '../ports/repositories';

export class InMemoryLots implements LotRepository {
  readonly rows = new Map<string, LotSnapshot>();
  balances: InMemoryBalances | null = null;
  async findById(tenantId: string, id: string): Promise<LotSnapshot | null> {
    const l = this.rows.get(id);
    return l && l.tenantId === tenantId ? l : null;
  }
  async findByNumber(
    tenantId: string,
    itemId: string,
    lotNumber: string,
  ): Promise<LotSnapshot | null> {
    return (
      [...this.rows.values()].find(
        (l) =>
          l.tenantId === tenantId &&
          l.itemId === itemId &&
          l.lotNumber === lotNumber,
      ) ?? null
    );
  }
  async create(lot: LotSnapshot): Promise<void> {
    this.rows.set(lot.id, lot);
  }
  private stockOf(lot: LotSnapshot): bigint {
    return [...(this.balances?.rows.values() ?? [])]
      .filter((b) => b.lotId === lot.id)
      .reduce((s, b) => s + b.onHandQty, 0n);
  }
  async listByItem(
    tenantId: string,
    itemId: string,
  ): Promise<readonly LotWithStock[]> {
    return [...this.rows.values()]
      .filter((l) => l.tenantId === tenantId && l.itemId === itemId)
      .map((lot) => ({ lot, onHandQty: this.stockOf(lot) }));
  }
  async listExpiringAllTenants(
    until: IsoDate,
    limit: number,
  ): Promise<readonly LotWithStock[]> {
    return [...this.rows.values()]
      .filter((l) => l.expiryDate !== null && l.expiryDate <= until)
      .map((lot) => ({ lot, onHandQty: this.stockOf(lot) }))
      .slice(0, limit);
  }
}

export class InMemoryBalances implements StockBalanceRepository {
  readonly rows = new Map<string, StockBalanceSnapshot>();
  constructor(private readonly lots: InMemoryLots) {
    lots.balances = this;
  }
  private withLot(b: StockBalanceSnapshot): BalanceWithLot {
    const lot = b.lotId ? this.lots.rows.get(b.lotId) : undefined;
    return {
      balance: b,
      lotNumber: lot?.lotNumber ?? null,
      expiryDate: lot?.expiryDate ?? null,
    };
  }
  async listForItem(
    tenantId: string,
    warehouseId: string,
    itemId: string,
  ): Promise<readonly BalanceWithLot[]> {
    return [...this.rows.values()]
      .filter(
        (b) =>
          b.tenantId === tenantId &&
          b.warehouseId === warehouseId &&
          b.itemId === itemId,
      )
      .map((b) => this.withLot(b));
  }
  async listByItem(
    tenantId: string,
    itemId: string,
  ): Promise<readonly BalanceWithLot[]> {
    return [...this.rows.values()]
      .filter((b) => b.tenantId === tenantId && b.itemId === itemId)
      .map((b) => this.withLot(b));
  }
  async listByWarehouse(
    tenantId: string,
    warehouseId: string,
    page: { limit: number; offset: number },
  ) {
    const all = [...this.rows.values()]
      .filter((b) => b.tenantId === tenantId && b.warehouseId === warehouseId)
      .map((b) => this.withLot(b));
    return {
      items: all.slice(page.offset, page.offset + page.limit),
      total: all.length,
    };
  }
  async findByKey(
    tenantId: string,
    warehouseId: string,
    itemId: string,
    lotId: string | null,
  ) {
    return (
      [...this.rows.values()].find(
        (b) =>
          b.tenantId === tenantId &&
          b.warehouseId === warehouseId &&
          b.itemId === itemId &&
          b.lotId === lotId,
      ) ?? null
    );
  }
  async create(b: StockBalanceSnapshot): Promise<void> {
    this.rows.set(b.id, b);
  }
  async save(b: StockBalanceSnapshot): Promise<StockBalanceSnapshot> {
    const stored = this.rows.get(b.id);
    if (!stored || stored.version !== b.version) {
      throw new InventoryVersionConflictError(
        b.id,
        b.version,
        stored?.version ?? -1,
      );
    }
    const next = { ...b, version: b.version + 1 };
    this.rows.set(b.id, next);
    return next;
  }
}

export class InMemoryMovements implements StockMovementRepository {
  readonly rows: StockMovementSnapshot[] = [];
  async append(m: StockMovementSnapshot): Promise<void> {
    this.rows.push(m);
  }
  async list(tenantId: string, f: MovementFilter) {
    const all = this.rows.filter(
      (m) =>
        m.tenantId === tenantId &&
        (!f.itemId || m.itemId === f.itemId) &&
        (!f.warehouseId || m.warehouseId === f.warehouseId) &&
        (!f.referenceType || m.referenceType === f.referenceType) &&
        (!f.referenceId || m.referenceId === f.referenceId),
    );
    return {
      items: all.slice(f.offset, f.offset + f.limit),
      total: all.length,
    };
  }
}

export class InMemoryCosts implements CostRepository {
  readonly layers = new Map<string, CostLayerSnapshot>();
  readonly averages = new Map<string, AverageCostSnapshot>();
  async openLayers(
    tenantId: string,
    warehouseId: string,
    itemId: string,
    lotId: string | null,
  ) {
    return [...this.layers.values()].filter(
      (l) =>
        l.tenantId === tenantId &&
        l.warehouseId === warehouseId &&
        l.itemId === itemId &&
        l.remainingQty > 0n &&
        (lotId === null || l.lotId === lotId),
    );
  }
  async listLayersByItem(tenantId: string, itemId: string) {
    return [...this.layers.values()].filter(
      (l) => l.tenantId === tenantId && l.itemId === itemId,
    );
  }
  async createLayer(layer: CostLayerSnapshot): Promise<void> {
    this.layers.set(layer.id, layer);
  }
  async saveLayers(layers: readonly CostLayerSnapshot[]): Promise<void> {
    for (const l of layers) this.layers.set(l.id, l);
  }
  async findAverage(tenantId: string, itemId: string) {
    return (
      [...this.averages.values()].find(
        (a) => a.tenantId === tenantId && a.itemId === itemId,
      ) ?? null
    );
  }
  async saveAverage(avg: AverageCostSnapshot): Promise<AverageCostSnapshot> {
    const stored = this.averages.get(avg.id);
    if (stored && stored.version !== avg.version) {
      throw new InventoryVersionConflictError(
        avg.id,
        avg.version,
        stored.version,
      );
    }
    const next = { ...avg, version: avg.version + 1 };
    this.averages.set(avg.id, next);
    return next;
  }
}

export class InMemorySerials implements SerialRepository {
  readonly rows = new Map<string, SerialUnitSnapshot>();
  async findMany(
    tenantId: string,
    itemId: string,
    serialNumbers: readonly string[],
  ) {
    return [...this.rows.values()].filter(
      (u) =>
        u.tenantId === tenantId &&
        u.itemId === itemId &&
        serialNumbers.includes(u.serialNumber),
    );
  }
  async findBySerial(tenantId: string, serialNumber: string) {
    return [...this.rows.values()].filter(
      (u) => u.tenantId === tenantId && u.serialNumber === serialNumber,
    );
  }
  async upsertMany(units: readonly SerialUnitSnapshot[]): Promise<void> {
    for (const u of units) this.rows.set(u.id, u);
  }
}

export class InMemoryReservations implements ReservationRepository {
  readonly rows = new Map<string, ReservationSnapshot>();
  async listActive(
    tenantId: string,
    referenceType: string,
    referenceId: string,
  ) {
    return [...this.rows.values()].filter(
      (r) =>
        r.tenantId === tenantId &&
        r.referenceType === referenceType &&
        r.referenceId === referenceId &&
        r.status === 'ACTIVE',
    );
  }
  async create(r: ReservationSnapshot): Promise<void> {
    this.rows.set(r.id, r);
  }
  async save(r: ReservationSnapshot): Promise<void> {
    this.rows.set(r.id, r);
  }
}

export class InMemoryTransfers implements TransferRepository {
  readonly rows = new Map<string, StockTransfer>();
  async findById(tenantId: string, id: string) {
    const t = this.rows.get(id);
    return t && t.snapshot().tenantId === tenantId ? t : null;
  }
  async list(
    tenantId: string,
    f: { status?: TransferStatus | null; limit: number; offset: number },
  ) {
    const all = [...this.rows.values()].filter(
      (t) =>
        t.snapshot().tenantId === tenantId &&
        (!f.status || t.status === f.status),
    );
    return {
      items: all.slice(f.offset, f.offset + f.limit),
      total: all.length,
    };
  }
  async create(t: StockTransfer): Promise<void> {
    this.rows.set(t.id, t);
  }
  async save(t: StockTransfer): Promise<StockTransfer> {
    const stored = this.rows.get(t.id);
    if (!stored || stored.version !== t.version) {
      throw new InventoryVersionConflictError(
        t.id,
        t.version,
        stored?.version ?? -1,
      );
    }
    const next = StockTransfer.fromSnapshot({
      ...t.snapshot(),
      version: t.version + 1,
    });
    this.rows.set(t.id, next);
    return next;
  }
}

export class InMemoryInventoryRefLookup implements InventoryRefLookup {
  readonly items = new Map<string, ItemRef>();
  readonly warehouses = new Set<string>(['wh-main', 'wh-2']);
  defaultWarehouse: string | null = 'wh-main';
  method: CostingMethod = CostingMethod.Fifo;
  async findItem(_t: string, id: string) {
    return this.items.get(id) ?? null;
  }
  async findItemBySku(_t: string, sku: string) {
    return [...this.items.values()].find((i) => i.sku === sku) ?? null;
  }
  async warehouseExists(_t: string, id: string) {
    return this.warehouses.has(id);
  }
  async findDefaultWarehouse() {
    return this.defaultWarehouse;
  }
  async costingMethod() {
    return this.method;
  }
}

export class InMemoryInventoryOutbox implements InventoryOutbox {
  readonly rows: InventoryOutboxEnvelope[] = [];
  async enqueue(envelope: InventoryOutboxEnvelope): Promise<void> {
    this.rows.push(envelope);
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

export class InMemoryCounts implements CountRepository {
  readonly rows = new Map<string, StockCount>();
  async findById(tenantId: string, id: string): Promise<StockCount | null> {
    const c = this.rows.get(id);
    return c && c.snapshot().tenantId === tenantId ? c : null;
  }
  async list(
    tenantId: string,
    f: {
      warehouseId?: string | null;
      status?: CountStatus | null;
      limit: number;
      offset: number;
    },
  ) {
    const all = [...this.rows.values()].filter(
      (c) =>
        c.snapshot().tenantId === tenantId &&
        (!f.warehouseId || c.snapshot().warehouseId === f.warehouseId) &&
        (!f.status || c.status === f.status),
    );
    return {
      items: all.slice(f.offset, f.offset + f.limit),
      total: all.length,
    };
  }
  async create(c: StockCount): Promise<void> {
    this.rows.set(c.id, c);
  }
  async save(c: StockCount): Promise<StockCount> {
    const stored = this.rows.get(c.id);
    if (!stored || stored.version !== c.version) {
      throw new InventoryVersionConflictError(
        c.id,
        c.version,
        stored?.version ?? -1,
      );
    }
    const next = StockCount.fromSnapshot({
      ...c.snapshot(),
      version: c.version + 1,
    });
    this.rows.set(c.id, next);
    return next;
  }
}
