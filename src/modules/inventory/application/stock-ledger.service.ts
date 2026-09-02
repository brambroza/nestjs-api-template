import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../shared/clock';
import { roundDiv, toIsoDate, type IsoDate } from '../../../shared/domain';
import { TENANT_CONTEXT, type TenantContext } from '../../../shared/tenant';
import {
  CostingMethod,
  InsufficientStockError,
  InvalidMovementError,
  InventoryRefInvalidError,
  LotRequiredError,
  MovementType,
  SerialNotAvailableError,
  SerialStatus,
  allocateFefo,
  applyAverageIssue,
  applyAverageReceipt,
  applyMovement,
  assertExpiry,
  availableQty,
  consumeFifo,
  defaultExpiry,
  isInbound,
  isOutbound,
  normaliseLotNumber,
  normaliseSerials,
  validateMovement,
  type AverageCostSnapshot,
  type SerialUnitSnapshot,
  type StockBalanceSnapshot,
  type StockMovementSnapshot,
  type StockShortage,
} from '../domain';

import {
  INVENTORY_REF_LOOKUP,
  type InventoryRefLookup,
  type ItemRef,
} from './ports/inventory-ref-lookup.port';
import { INVENTORY_LEDGER, type InventoryLedger } from './ports/ledger.port';
import { INVENTORY_OUTBOX, type InventoryOutbox } from './ports/outbox.port';
import {
  COST_REPOSITORY,
  LOT_REPOSITORY,
  RESERVATION_REPOSITORY,
  SERIAL_REPOSITORY,
  STOCK_BALANCE_REPOSITORY,
  STOCK_MOVEMENT_REPOSITORY,
  type BalanceWithLot,
  type CostRepository,
  type LotRepository,
  type ReservationRepository,
  type ReservationSnapshot,
  type SerialRepository,
  type StockBalanceRepository,
  type StockMovementRepository,
} from './ports/repositories';

export interface PostLineCommand {
  readonly itemId: string;
  readonly quantity: bigint;
  readonly uomCode?: string | null;
  /** Inbound only. Defaults to the item's average cost (or 0). */
  readonly unitCostMinor?: bigint | null;
  readonly lotNumber?: string | null;
  readonly expiryDate?: IsoDate | null;
  readonly serialNumbers?: readonly string[] | null;
}

export interface PostCommand {
  readonly warehouseId: string;
  readonly type: MovementType;
  readonly currency: string;
  readonly referenceType: string;
  readonly referenceId: string;
  readonly reason?: string | null;
  readonly lines: readonly PostLineCommand[];
  /** Outbound: this document's ACTIVE reservations are consumed first. */
  readonly consumeReservations?: boolean;
}

export interface ReserveCommand {
  readonly warehouseId: string;
  readonly referenceType: string;
  readonly referenceId: string;
  readonly lines: readonly PostLineCommand[];
}

export type ReserveResult =
  | {
      readonly kind: 'reserved';
      readonly warehouseId: string;
      readonly movements: readonly StockMovementSnapshot[];
    }
  | {
      readonly kind: 'shortage';
      readonly warehouseId: string;
      readonly shortages: readonly StockShortage[];
    };

interface Candidate extends BalanceWithLot {
  readonly available: bigint;
  readonly reservedByDoc: bigint;
}

/**
 * The single writer of the stock ledger (T-320). Every entry point —
 * goods receipt, delivery, transfer, adjustment, reservation — goes
 * through `post` / `reserve` / `release`, so the invariants live in one
 * place: quantities never go negative, reservations never exceed
 * on-hand, LOT items always carry a lot (FEFO when unspecified),
 * SERIAL items always carry exactly `quantity` serials, and every
 * outbound is costed by the tenant's method (FIFO layers or moving
 * average). Runs inside the caller's transaction (ADR 0002).
 */
@Injectable()
export class StockLedgerService {
  constructor(
    @Inject(STOCK_BALANCE_REPOSITORY)
    private readonly balances: StockBalanceRepository,
    @Inject(STOCK_MOVEMENT_REPOSITORY)
    private readonly movements: StockMovementRepository,
    @Inject(COST_REPOSITORY) private readonly costs: CostRepository,
    @Inject(LOT_REPOSITORY) private readonly lots: LotRepository,
    @Inject(SERIAL_REPOSITORY) private readonly serials: SerialRepository,
    @Inject(RESERVATION_REPOSITORY)
    private readonly reservations: ReservationRepository,
    @Inject(INVENTORY_REF_LOOKUP) private readonly refs: InventoryRefLookup,
    @Inject(INVENTORY_OUTBOX) private readonly outbox: InventoryOutbox,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(INVENTORY_LEDGER) private readonly gl: InventoryLedger,
  ) {}

  async post(cmd: PostCommand): Promise<StockMovementSnapshot[]> {
    if (
      cmd.type === MovementType.Reserve ||
      cmd.type === MovementType.Unreserve
    ) {
      throw new InvalidMovementError(
        'use reserve()/release() for reservations',
      );
    }
    if (cmd.lines.length === 0) throw new InvalidMovementError('no lines');
    const tenantId = this.tenant.getTenantId();
    const userId = this.tenant.tryGetUserId() ?? 'system';
    const now = this.clock.now();
    await this.assertWarehouse(tenantId, cmd.warehouseId);
    const items = await this.loadItems(tenantId, cmd.lines);
    const method = await this.refs.costingMethod(tenantId);
    const currency = cmd.currency.trim().toUpperCase();
    const out: StockMovementSnapshot[] = [];

    if (isInbound(cmd.type)) {
      for (const line of cmd.lines) {
        const item = items.get(line.itemId) as ItemRef;
        out.push(
          await this.postInbound(
            tenantId,
            userId,
            now,
            cmd,
            line,
            item,
            method,
            currency,
          ),
        );
      }
    } else if (isOutbound(cmd.type)) {
      const active = cmd.consumeReservations
        ? await this.reservations.listActive(
            tenantId,
            cmd.referenceType,
            cmd.referenceId,
          )
        : [];
      const plans = await this.planOutbound(
        tenantId,
        cmd.warehouseId,
        cmd.lines,
        items,
        active,
      );
      for (const plan of plans) {
        for (const alloc of plan.allocations) {
          out.push(
            await this.postOutbound(
              tenantId,
              userId,
              now,
              cmd,
              plan.line,
              plan.item,
              alloc,
              method,
              currency,
              active,
            ),
          );
        }
      }
    }
    if (out.length > 0) {
      await this.gl.movementsPosted({
        warehouseId: cmd.warehouseId,
        referenceType: cmd.referenceType.trim().toUpperCase(),
        referenceId: cmd.referenceId,
        currency,
        movements: out,
      });
    }
    return out;
  }

  async reserve(cmd: ReserveCommand): Promise<ReserveResult> {
    if (cmd.lines.length === 0) throw new InvalidMovementError('no lines');
    const tenantId = this.tenant.getTenantId();
    const userId = this.tenant.tryGetUserId() ?? 'system';
    const now = this.clock.now();
    await this.assertWarehouse(tenantId, cmd.warehouseId);
    const items = await this.loadItems(tenantId, cmd.lines);
    let plans: Awaited<ReturnType<StockLedgerService['planOutbound']>>;
    try {
      plans = await this.planOutbound(
        tenantId,
        cmd.warehouseId,
        cmd.lines,
        items,
        [],
      );
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        return {
          kind: 'shortage',
          warehouseId: cmd.warehouseId,
          shortages: err.shortages,
        };
      }
      throw err;
    }
    const movements: StockMovementSnapshot[] = [];
    for (const plan of plans) {
      for (const alloc of plan.allocations) {
        const next = await this.balances.save(
          applyMovement(alloc.source.balance, MovementType.Reserve, alloc.qty),
        );
        const m = this.movement({
          tenantId,
          userId,
          now,
          warehouseId: cmd.warehouseId,
          item: plan.item,
          lotId: next.lotId,
          uomCode: next.uomCode,
          type: MovementType.Reserve,
          quantity: alloc.qty,
          unitCostMinor: 0n,
          costMinor: 0n,
          currency: 'THB',
          referenceType: cmd.referenceType,
          referenceId: cmd.referenceId,
          reason: null,
          serialNumbers: [],
        });
        await this.movements.append(m);
        movements.push(m);
        const r: ReservationSnapshot = {
          id: randomUUID(),
          tenantId,
          warehouseId: cmd.warehouseId,
          itemId: plan.item.id,
          lotId: next.lotId,
          uomCode: next.uomCode,
          quantity: alloc.qty,
          status: 'ACTIVE',
          referenceType: cmd.referenceType,
          referenceId: cmd.referenceId,
          createdAt: now,
        };
        await this.reservations.create(r);
      }
      if (plan.line.serialNumbers?.length) {
        await this.markSerials(
          tenantId,
          plan.item,
          cmd.warehouseId,
          plan.line,
          SerialStatus.Reserved,
          null,
          now,
        );
      }
    }
    return { kind: 'reserved', warehouseId: cmd.warehouseId, movements };
  }

  /** Releases every ACTIVE reservation of a document; returns how many rows were released. */
  async release(referenceType: string, referenceId: string): Promise<number> {
    const tenantId = this.tenant.getTenantId();
    const userId = this.tenant.tryGetUserId() ?? 'system';
    const now = this.clock.now();
    const active = await this.reservations.listActive(
      tenantId,
      referenceType,
      referenceId,
    );
    for (const r of active) {
      const balance = await this.balances.findByKey(
        tenantId,
        r.warehouseId,
        r.itemId,
        r.lotId,
      );
      if (balance) {
        await this.balances.save(
          applyMovement(balance, MovementType.Unreserve, r.quantity),
        );
      }
      const item = await this.refs.findItem(tenantId, r.itemId);
      await this.movements.append(
        this.movement({
          tenantId,
          userId,
          now,
          warehouseId: r.warehouseId,
          item: item ?? {
            id: r.itemId,
            sku: r.itemId,
            name: '',
            defaultUomCode: r.uomCode,
            trackingPolicy: 'NONE',
            shelfLifeDays: null,
            isActive: true,
          },
          lotId: r.lotId,
          uomCode: r.uomCode,
          type: MovementType.Unreserve,
          quantity: r.quantity,
          unitCostMinor: 0n,
          costMinor: 0n,
          currency: 'THB',
          referenceType,
          referenceId,
          reason: null,
          serialNumbers: [],
        }),
      );
      await this.reservations.save({ ...r, status: 'RELEASED' });
    }
    return active.length;
  }

  // ---- helpers -------------------------------------------------------------

  private async assertWarehouse(
    tenantId: string,
    warehouseId: string,
  ): Promise<void> {
    if (!(await this.refs.warehouseExists(tenantId, warehouseId))) {
      throw new InventoryRefInvalidError(
        `warehouse ${warehouseId} does not exist or is inactive`,
      );
    }
  }

  private async loadItems(
    tenantId: string,
    lines: readonly PostLineCommand[],
  ): Promise<Map<string, ItemRef>> {
    const map = new Map<string, ItemRef>();
    for (const l of lines) {
      if (l.quantity <= 0n)
        throw new InvalidMovementError(
          `item ${l.itemId}: quantity must be > 0`,
        );
      if (map.has(l.itemId)) continue;
      const item = await this.refs.findItem(tenantId, l.itemId);
      if (!item?.isActive) {
        throw new InventoryRefInvalidError(
          `item ${l.itemId} does not exist or is inactive`,
        );
      }
      map.set(l.itemId, item);
    }
    return map;
  }

  private movement(args: {
    tenantId: string;
    userId: string;
    now: Date;
    warehouseId: string;
    item: ItemRef;
    lotId: string | null;
    uomCode: string;
    type: MovementType;
    quantity: bigint;
    unitCostMinor: bigint;
    costMinor: bigint;
    currency: string;
    referenceType: string;
    referenceId: string;
    reason: string | null;
    serialNumbers: readonly string[];
  }): StockMovementSnapshot {
    const m: StockMovementSnapshot = {
      id: randomUUID(),
      tenantId: args.tenantId,
      warehouseId: args.warehouseId,
      itemId: args.item.id,
      itemSku: args.item.sku,
      lotId: args.lotId,
      uomCode: args.uomCode,
      type: args.type,
      quantity: args.quantity,
      unitCostMinor: args.unitCostMinor,
      costMinor: args.costMinor,
      currency: args.currency,
      referenceType: args.referenceType.trim().toUpperCase(),
      referenceId: args.referenceId,
      reason: (args.reason ?? '').trim() || null,
      serialNumbers: args.serialNumbers,
      occurredAt: args.now,
      createdBy: args.userId,
    };
    validateMovement(m);
    return m;
  }

  private async emit(m: StockMovementSnapshot): Promise<void> {
    await this.outbox.enqueue({
      idempotencyKey: `inv:${m.id}`,
      event: {
        type: 'inventory.movement_posted.v1',
        aggregateId: m.id,
        tenantId: m.tenantId,
        occurredAt: m.occurredAt,
        warehouseId: m.warehouseId,
        itemId: m.itemId,
        itemSku: m.itemSku,
        movementType: m.type,
        quantity: m.quantity,
        uomCode: m.uomCode,
        costMinor: m.costMinor,
        currency: m.currency,
        referenceType: m.referenceType,
        referenceId: m.referenceId,
        actor: m.createdBy,
      },
    });
  }

  private async resolveLot(
    tenantId: string,
    item: ItemRef,
    line: PostLineCommand,
    now: Date,
    createIfMissing: boolean,
  ): Promise<string | null> {
    const raw = (line.lotNumber ?? '').trim();
    if (raw.length === 0) {
      if (item.trackingPolicy === 'LOT' && createIfMissing)
        throw new LotRequiredError(item.sku);
      return null;
    }
    const lotNumber = normaliseLotNumber(raw);
    const existing = await this.lots.findByNumber(tenantId, item.id, lotNumber);
    if (existing) return existing.id;
    if (!createIfMissing) {
      throw new InventoryRefInvalidError(
        `lot ${lotNumber} of ${item.sku} does not exist`,
      );
    }
    const lot = {
      id: randomUUID(),
      tenantId,
      itemId: item.id,
      lotNumber,
      expiryDate:
        assertExpiry(line.expiryDate ?? null) ??
        defaultExpiry(toIsoDate(now), item.shelfLifeDays),
      createdAt: now,
    };
    await this.lots.create(lot);
    return lot.id;
  }

  private async balanceFor(
    tenantId: string,
    warehouseId: string,
    item: ItemRef,
    lotId: string | null,
    uomCode: string,
  ): Promise<StockBalanceSnapshot> {
    const found = await this.balances.findByKey(
      tenantId,
      warehouseId,
      item.id,
      lotId,
    );
    if (found) return found;
    const b: StockBalanceSnapshot = {
      id: randomUUID(),
      tenantId,
      warehouseId,
      itemId: item.id,
      lotId,
      uomCode,
      onHandQty: 0n,
      reservedQty: 0n,
      version: 0,
    };
    await this.balances.create(b);
    return b;
  }

  private async postInbound(
    tenantId: string,
    userId: string,
    now: Date,
    cmd: PostCommand,
    line: PostLineCommand,
    item: ItemRef,
    method: CostingMethod,
    currency: string,
  ): Promise<StockMovementSnapshot> {
    const uomCode =
      (line.uomCode ?? '').trim().toUpperCase() || item.defaultUomCode;
    const lotId = await this.resolveLot(tenantId, item, line, now, true);
    const avg = await this.costs.findAverage(tenantId, item.id);
    const unitCostMinor = line.unitCostMinor ?? avg?.unitCostMinor ?? 0n;
    if (unitCostMinor < 0n)
      throw new InvalidMovementError('unit cost must be >= 0');
    const serialNumbers =
      item.trackingPolicy === 'SERIAL'
        ? normaliseSerials(line.serialNumbers ?? [], line.quantity)
        : [];
    const balance = await this.balanceFor(
      tenantId,
      cmd.warehouseId,
      item,
      lotId,
      uomCode,
    );
    await this.balances.save(applyMovement(balance, cmd.type, line.quantity));
    const m = this.movement({
      tenantId,
      userId,
      now,
      warehouseId: cmd.warehouseId,
      item,
      lotId,
      uomCode,
      type: cmd.type,
      quantity: line.quantity,
      unitCostMinor,
      costMinor: unitCostMinor * line.quantity,
      currency,
      referenceType: cmd.referenceType,
      referenceId: cmd.referenceId,
      reason: cmd.reason ?? null,
      serialNumbers,
    });
    if (method === CostingMethod.Fifo) {
      await this.costs.createLayer({
        id: randomUUID(),
        tenantId,
        warehouseId: cmd.warehouseId,
        itemId: item.id,
        lotId,
        movementId: m.id,
        receivedAt: now,
        originalQty: line.quantity,
        remainingQty: line.quantity,
        unitCostMinor,
        currency,
      });
    }
    // The average is maintained under both methods so inquiries and ADJUST_IN defaults have a value.
    const base: AverageCostSnapshot = avg ?? {
      id: randomUUID(),
      tenantId,
      itemId: item.id,
      quantity: 0n,
      totalCostMinor: 0n,
      unitCostMinor: 0n,
      currency,
      version: 0,
    };
    await this.costs.saveAverage(
      applyAverageReceipt(base, line.quantity, unitCostMinor),
    );
    if (serialNumbers.length > 0) {
      await this.markSerials(
        tenantId,
        item,
        cmd.warehouseId,
        { ...line, serialNumbers },
        SerialStatus.InStock,
        m.id,
        now,
        lotId,
      );
    }
    await this.movements.append(m);
    await this.emit(m);
    return m;
  }

  private async planOutbound(
    tenantId: string,
    warehouseId: string,
    lines: readonly PostLineCommand[],
    items: ReadonlyMap<string, ItemRef>,
    active: readonly ReservationSnapshot[],
  ): Promise<
    Array<{
      line: PostLineCommand;
      item: ItemRef;
      allocations: ReadonlyArray<{ source: Candidate; qty: bigint }>;
    }>
  > {
    const shortages: StockShortage[] = [];
    const plans: Array<{
      line: PostLineCommand;
      item: ItemRef;
      allocations: ReadonlyArray<{ source: Candidate; qty: bigint }>;
    }> = [];
    // Track quantities already allocated in this call so two lines of the same item do not double-count.
    const taken = new Map<string, bigint>();
    for (const line of lines) {
      const item = items.get(line.itemId) as ItemRef;
      const lotId = await this.resolveLot(
        tenantId,
        item,
        line,
        this.clock.now(),
        false,
      );
      const all = await this.balances.listForItem(
        tenantId,
        warehouseId,
        item.id,
      );
      const candidates: Candidate[] = all
        .filter((b) => lotId === null || b.balance.lotId === lotId)
        .map((b) => {
          const reservedByDoc = active
            .filter(
              (r) =>
                r.warehouseId === warehouseId &&
                r.itemId === item.id &&
                r.lotId === b.balance.lotId,
            )
            .reduce((s, r) => s + r.quantity, 0n);
          const already = taken.get(b.balance.id) ?? 0n;
          return {
            ...b,
            reservedByDoc,
            available: availableQty(b.balance) + reservedByDoc - already,
          };
        })
        .sort((a, b) => {
          const ea = a.expiryDate ?? '9999-12-31';
          const eb = b.expiryDate ?? '9999-12-31';
          return ea < eb
            ? -1
            : ea > eb
              ? 1
              : (a.lotNumber ?? '').localeCompare(b.lotNumber ?? '');
        });
      const { allocations, shortfall } = allocateFefo(
        candidates,
        line.quantity,
      );
      if (shortfall > 0n) {
        shortages.push({
          itemId: item.id,
          itemSku: item.sku,
          uomCode:
            (line.uomCode ?? '').trim().toUpperCase() || item.defaultUomCode,
          requiredQty: line.quantity,
          availableQty: line.quantity - shortfall,
        });
        continue;
      }
      for (const a of allocations)
        taken.set(
          a.source.balance.id,
          (taken.get(a.source.balance.id) ?? 0n) + a.qty,
        );
      plans.push({ line, item, allocations });
    }
    if (shortages.length > 0)
      throw new InsufficientStockError(warehouseId, shortages);
    return plans;
  }

  private async postOutbound(
    tenantId: string,
    userId: string,
    now: Date,
    cmd: PostCommand,
    line: PostLineCommand,
    item: ItemRef,
    alloc: { source: Candidate; qty: bigint },
    method: CostingMethod,
    currency: string,
    active: readonly ReservationSnapshot[],
  ): Promise<StockMovementSnapshot> {
    const balance =
      (await this.balances.findByKey(
        tenantId,
        cmd.warehouseId,
        item.id,
        alloc.source.balance.lotId,
      )) ?? alloc.source.balance;
    const consume =
      alloc.source.reservedByDoc < alloc.qty
        ? alloc.source.reservedByDoc
        : alloc.qty;
    await this.balances.save(
      applyMovement(balance, cmd.type, alloc.qty, consume),
    );
    if (consume > 0n)
      await this.consumeReservations(
        active,
        cmd.warehouseId,
        item.id,
        balance.lotId,
        consume,
      );
    let costMinor = 0n;
    if (method === CostingMethod.Fifo) {
      const layers = await this.costs.openLayers(
        tenantId,
        cmd.warehouseId,
        item.id,
        balance.lotId,
      );
      const r = consumeFifo(layers, alloc.qty);
      await this.costs.saveLayers(r.updated);
      costMinor = r.costMinor;
      if (r.uncosted > 0n) {
        const avg = await this.costs.findAverage(tenantId, item.id);
        costMinor += r.uncosted * (avg?.unitCostMinor ?? 0n);
      }
    } else {
      const avg = await this.costs.findAverage(tenantId, item.id);
      if (avg) {
        const r = applyAverageIssue(avg, alloc.qty);
        await this.costs.saveAverage(r.next);
        costMinor = r.costMinor;
      }
    }
    const serialNumbers =
      item.trackingPolicy === 'SERIAL'
        ? normaliseSerials(line.serialNumbers ?? [], line.quantity)
        : [];
    const m = this.movement({
      tenantId,
      userId,
      now,
      warehouseId: cmd.warehouseId,
      item,
      lotId: balance.lotId,
      uomCode: balance.uomCode,
      type: cmd.type,
      quantity: alloc.qty,
      unitCostMinor: roundDiv(costMinor, alloc.qty),
      costMinor,
      currency,
      referenceType: cmd.referenceType,
      referenceId: cmd.referenceId,
      reason: cmd.reason ?? null,
      serialNumbers,
    });
    if (serialNumbers.length > 0) {
      const status =
        cmd.type === MovementType.TransferOut
          ? SerialStatus.InTransit
          : SerialStatus.Issued;
      await this.markSerials(
        tenantId,
        item,
        cmd.warehouseId,
        { ...line, serialNumbers },
        status,
        m.id,
        now,
      );
    }
    await this.movements.append(m);
    await this.emit(m);
    return m;
  }

  private async consumeReservations(
    active: readonly ReservationSnapshot[],
    warehouseId: string,
    itemId: string,
    lotId: string | null,
    quantity: bigint,
  ): Promise<void> {
    let remaining = quantity;
    for (const r of active) {
      if (remaining <= 0n) break;
      if (
        r.status !== 'ACTIVE' ||
        r.warehouseId !== warehouseId ||
        r.itemId !== itemId ||
        r.lotId !== lotId
      )
        continue;
      const take = r.quantity < remaining ? r.quantity : remaining;
      const left = r.quantity - take;
      const next: ReservationSnapshot = {
        ...r,
        quantity: left,
        status: left === 0n ? 'CONSUMED' : 'ACTIVE',
      };
      await this.reservations.save(next);
      Object.assign(r, next);
      remaining -= take;
    }
  }

  private async markSerials(
    tenantId: string,
    item: ItemRef,
    warehouseId: string,
    line: PostLineCommand,
    status: SerialUnitSnapshot['status'],
    movementId: string | null,
    now: Date,
    lotId: string | null = null,
  ): Promise<void> {
    const serialNumbers = normaliseSerials(
      line.serialNumbers ?? [],
      line.quantity,
    );
    const existing = await this.serials.findMany(
      tenantId,
      item.id,
      serialNumbers,
    );
    const byNumber = new Map(existing.map((u) => [u.serialNumber, u]));
    const units: SerialUnitSnapshot[] = serialNumbers.map((sn) => {
      const u = byNumber.get(sn);
      if (status === SerialStatus.InStock) {
        if (
          u &&
          u.status !== SerialStatus.Issued &&
          u.status !== SerialStatus.InTransit
        ) {
          throw new SerialNotAvailableError(
            item.sku,
            sn,
            `already ${u.status} in warehouse ${u.warehouseId ?? '?'}`,
          );
        }
        return {
          id: u?.id ?? randomUUID(),
          tenantId,
          itemId: item.id,
          serialNumber: sn,
          warehouseId,
          lotId,
          status,
          lastMovementId: movementId,
          createdAt: u?.createdAt ?? now,
        };
      }
      if (
        !u ||
        u.warehouseId !== warehouseId ||
        u.status === SerialStatus.Issued ||
        u.status === SerialStatus.InTransit
      ) {
        throw new SerialNotAvailableError(
          item.sku,
          sn,
          u
            ? `is ${u.status} in warehouse ${u.warehouseId ?? '?'}`
            : 'unknown serial',
        );
      }
      return {
        ...u,
        status,
        warehouseId:
          status === SerialStatus.Issued || status === SerialStatus.InTransit
            ? null
            : warehouseId,
        lastMovementId: movementId ?? u.lastMovementId,
      };
    });
    await this.serials.upsertMany(units);
  }
}
