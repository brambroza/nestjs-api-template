import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../shared/clock';
import { addDays, toIsoDate } from '../../../shared/domain';
import { TENANT_CONTEXT, type TenantContext } from '../../../shared/tenant';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../../shared/transaction';
import {
  InventoryRefInvalidError,
  MovementType,
  expiryStatus,
  type AverageCostSnapshot,
  type CostLayerSnapshot,
  type ExpiryStatus,
  type SerialUnitSnapshot,
  type StockMovementSnapshot,
} from '../domain';

import {
  INVENTORY_REF_LOOKUP,
  type InventoryRefLookup,
  type ItemRef,
} from './ports/inventory-ref-lookup.port';
import {
  COST_REPOSITORY,
  LOT_REPOSITORY,
  SERIAL_REPOSITORY,
  STOCK_BALANCE_REPOSITORY,
  STOCK_MOVEMENT_REPOSITORY,
  type BalanceWithLot,
  type CostRepository,
  type LotRepository,
  type LotWithStock,
  type MovementFilter,
  type SerialRepository,
  type StockBalanceRepository,
  type StockMovementRepository,
} from './ports/repositories';
import {
  StockLedgerService,
  type PostLineCommand,
  type ReserveResult,
} from './stock-ledger.service';

export interface ManualMovementInput {
  readonly warehouseId: string;
  readonly currency?: string | null;
  readonly reason?: string | null;
  readonly referenceType?: string | null;
  readonly referenceId?: string | null;
  readonly lines: readonly PostLineCommand[];
}

/** Manual RECEIPT (opening stock, returns, found goods). */
@Injectable()
export class ReceiveStockUseCase {
  constructor(
    private readonly ledger: StockLedgerService,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
  ) {}

  async execute(input: ManualMovementInput): Promise<StockMovementSnapshot[]> {
    return this.tx.runInTransaction(() =>
      this.ledger.post({
        warehouseId: input.warehouseId,
        type: MovementType.Receipt,
        currency: input.currency ?? 'THB',
        referenceType: input.referenceType ?? 'MANUAL_RECEIPT',
        referenceId: input.referenceId ?? randomUUID(),
        reason: input.reason,
        lines: input.lines,
      }),
    );
  }
}

/** Manual ISSUE (consumption, samples, scrap). */
@Injectable()
export class IssueStockUseCase {
  constructor(
    private readonly ledger: StockLedgerService,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
  ) {}

  async execute(input: ManualMovementInput): Promise<StockMovementSnapshot[]> {
    return this.tx.runInTransaction(() =>
      this.ledger.post({
        warehouseId: input.warehouseId,
        type: MovementType.Issue,
        currency: input.currency ?? 'THB',
        referenceType: input.referenceType ?? 'MANUAL_ISSUE',
        referenceId: input.referenceId ?? randomUUID(),
        reason: input.reason,
        lines: input.lines,
        consumeReservations: false,
      }),
    );
  }
}

export interface AdjustStockInput extends ManualMovementInput {
  readonly direction: 'IN' | 'OUT';
  readonly reason: string;
}

/** Stock adjustment with a mandatory reason; physical counts (batch 1b) post through here. */
@Injectable()
export class AdjustStockUseCase {
  constructor(
    private readonly ledger: StockLedgerService,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
  ) {}

  async execute(input: AdjustStockInput): Promise<StockMovementSnapshot[]> {
    return this.tx.runInTransaction(() =>
      this.ledger.post({
        warehouseId: input.warehouseId,
        type:
          input.direction === 'IN'
            ? MovementType.AdjustIn
            : MovementType.AdjustOut,
        currency: input.currency ?? 'THB',
        referenceType: input.referenceType ?? 'ADJUSTMENT',
        referenceId: input.referenceId ?? randomUUID(),
        reason: input.reason,
        lines: input.lines,
        consumeReservations: false,
      }),
    );
  }
}

export interface ReserveStockInput {
  readonly warehouseId: string;
  readonly referenceType: string;
  readonly referenceId: string;
  readonly lines: readonly PostLineCommand[];
}

@Injectable()
export class ReserveStockUseCase {
  constructor(
    private readonly ledger: StockLedgerService,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
  ) {}

  async execute(input: ReserveStockInput): Promise<ReserveResult> {
    return this.tx.runInTransaction(() => this.ledger.reserve(input));
  }
}

@Injectable()
export class ReleaseReservationUseCase {
  constructor(
    private readonly ledger: StockLedgerService,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
  ) {}

  async execute(referenceType: string, referenceId: string): Promise<number> {
    return this.tx.runInTransaction(() =>
      this.ledger.release(referenceType, referenceId),
    );
  }
}

export interface ItemStockView {
  readonly item: ItemRef;
  readonly onHandQty: bigint;
  readonly reservedQty: bigint;
  readonly availableQty: bigint;
  readonly averageCost: AverageCostSnapshot | null;
  /** Σ remainingQty × unitCost over open FIFO layers. */
  readonly fifoValueMinor: bigint;
  readonly balances: readonly (BalanceWithLot & {
    readonly expiry: ExpiryStatus;
  })[];
  readonly layers: readonly CostLayerSnapshot[];
}

/** T-327 real-time inquiry: one item across warehouses and lots. */
@Injectable()
export class GetItemStockUseCase {
  constructor(
    @Inject(STOCK_BALANCE_REPOSITORY)
    private readonly balances: StockBalanceRepository,
    @Inject(COST_REPOSITORY) private readonly costs: CostRepository,
    @Inject(INVENTORY_REF_LOOKUP) private readonly refs: InventoryRefLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(itemId: string): Promise<ItemStockView> {
    const tenantId = this.tenant.getTenantId();
    const item = await this.refs.findItem(tenantId, itemId);
    if (!item)
      throw new InventoryRefInvalidError(`item ${itemId} does not exist`);
    const today = toIsoDate(this.clock.now());
    const [rows, averageCost, layers] = await Promise.all([
      this.balances.listByItem(tenantId, itemId),
      this.costs.findAverage(tenantId, itemId),
      this.costs.listLayersByItem(tenantId, itemId),
    ]);
    const onHandQty = rows.reduce((s, r) => s + r.balance.onHandQty, 0n);
    const reservedQty = rows.reduce((s, r) => s + r.balance.reservedQty, 0n);
    return {
      item,
      onHandQty,
      reservedQty,
      availableQty: onHandQty - reservedQty,
      averageCost,
      fifoValueMinor: layers.reduce(
        (s, l) => s + l.remainingQty * l.unitCostMinor,
        0n,
      ),
      balances: rows.map((r) => ({
        ...r,
        expiry: expiryStatus(r.expiryDate, today),
      })),
      layers: layers.filter((l) => l.remainingQty > 0n),
    };
  }
}

@Injectable()
export class ListWarehouseStockUseCase {
  constructor(
    @Inject(STOCK_BALANCE_REPOSITORY)
    private readonly balances: StockBalanceRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(input: {
    warehouseId: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.max(1, Math.min(500, Math.trunc(input.limit ?? 100)));
    const offset = Math.max(0, Math.trunc(input.offset ?? 0));
    const page = await this.balances.listByWarehouse(
      this.tenant.getTenantId(),
      input.warehouseId,
      { limit, offset },
    );
    return { ...page, limit, offset };
  }
}

@Injectable()
export class ListMovementsUseCase {
  constructor(
    @Inject(STOCK_MOVEMENT_REPOSITORY)
    private readonly movements: StockMovementRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(
    input: Omit<MovementFilter, 'limit' | 'offset'> & {
      limit?: number;
      offset?: number;
    },
  ) {
    const limit = Math.max(1, Math.min(500, Math.trunc(input.limit ?? 100)));
    const offset = Math.max(0, Math.trunc(input.offset ?? 0));
    const page = await this.movements.list(this.tenant.getTenantId(), {
      ...input,
      limit,
      offset,
    });
    return { ...page, limit, offset };
  }
}

@Injectable()
export class ListLotsUseCase {
  constructor(
    @Inject(LOT_REPOSITORY) private readonly lots: LotRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: {
    itemId: string;
    expiringWithinDays?: number | null;
  }): Promise<ReadonlyArray<LotWithStock & { readonly expiry: ExpiryStatus }>> {
    const today = toIsoDate(this.clock.now());
    const rows = await this.lots.listByItem(
      this.tenant.getTenantId(),
      input.itemId,
    );
    const horizon = input.expiringWithinDays ?? null;
    return rows
      .filter((r) => {
        if (horizon === null) return true;
        const e = r.lot.expiryDate;
        return e !== null && e <= addDays(today, horizon) && r.onHandQty > 0n;
      })
      .map((r) => ({ ...r, expiry: expiryStatus(r.lot.expiryDate, today) }));
  }
}

/** T-323: where is this serial now? */
@Injectable()
export class FindSerialUseCase {
  constructor(
    @Inject(SERIAL_REPOSITORY) private readonly serials: SerialRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(serialNumber: string): Promise<readonly SerialUnitSnapshot[]> {
    return this.serials.findBySerial(
      this.tenant.getTenantId(),
      serialNumber.trim().toUpperCase(),
    );
  }
}
