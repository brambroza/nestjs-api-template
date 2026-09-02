import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../shared/database';
import { fromIsoDate, toIsoDate } from '../../../shared/domain';
import {
  InventoryVersionConflictError,
  StockTransfer,
  TransferStatus,
  isMovementType,
  isSerialStatus,
  isTransferStatus,
  type AverageCostSnapshot,
  type CostLayerSnapshot,
  type LotSnapshot,
  type SerialUnitSnapshot,
  type StockBalanceSnapshot,
  type StockMovementSnapshot,
} from '../domain';
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
} from '../application/ports/repositories';

@Injectable()
export class PrismaLotRepository implements LotRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  private toLot(r: {
    id: string;
    tenantId: string;
    itemId: string;
    lotNumber: string;
    expiryDate: Date | null;
    createdAt: Date;
  }): LotSnapshot {
    return { ...r, expiryDate: r.expiryDate ? toIsoDate(r.expiryDate) : null };
  }

  async findById(tenantId: string, id: string): Promise<LotSnapshot | null> {
    const r = await this.txm
      .getClient()
      .lot.findFirst({ where: { tenantId, id } });
    return r ? this.toLot(r) : null;
  }

  async findByNumber(
    tenantId: string,
    itemId: string,
    lotNumber: string,
  ): Promise<LotSnapshot | null> {
    const r = await this.txm
      .getClient()
      .lot.findFirst({ where: { tenantId, itemId, lotNumber } });
    return r ? this.toLot(r) : null;
  }

  async create(lot: LotSnapshot): Promise<void> {
    await this.txm.getClient().lot.create({
      data: {
        ...lot,
        expiryDate: lot.expiryDate ? fromIsoDate(lot.expiryDate) : null,
      },
    });
  }

  private async withStock(
    lots: readonly LotSnapshot[],
  ): Promise<LotWithStock[]> {
    if (lots.length === 0) return [];
    const sums = await this.txm.getClient().stockBalance.groupBy({
      by: ['lotId'],
      where: { lotId: { in: lots.map((l) => l.id) } },
      _sum: { onHandQty: true },
    });
    const byLot = new Map(sums.map((s) => [s.lotId, s._sum.onHandQty ?? 0n]));
    return lots.map((lot) => ({ lot, onHandQty: byLot.get(lot.id) ?? 0n }));
  }

  async listByItem(
    tenantId: string,
    itemId: string,
  ): Promise<readonly LotWithStock[]> {
    const rows = await this.txm.getClient().lot.findMany({
      where: { tenantId, itemId },
      orderBy: [{ expiryDate: 'asc' }, { lotNumber: 'asc' }],
    });
    return this.withStock(rows.map((r) => this.toLot(r)));
  }

  async listExpiringAllTenants(
    until: string,
    limit: number,
  ): Promise<readonly LotWithStock[]> {
    const rows = await this.txm.getClient().lot.findMany({
      where: { expiryDate: { lte: fromIsoDate(until) } },
      orderBy: { expiryDate: 'asc' },
      take: limit,
    });
    return this.withStock(rows.map((r) => this.toLot(r)));
  }
}

@Injectable()
export class PrismaStockBalanceRepository implements StockBalanceRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  private async decorate(
    rows: readonly StockBalanceSnapshot[],
  ): Promise<BalanceWithLot[]> {
    const lotIds = [
      ...new Set(
        rows.map((r) => r.lotId).filter((x): x is string => x !== null),
      ),
    ];
    const lots = lotIds.length
      ? await this.txm
          .getClient()
          .lot.findMany({ where: { id: { in: lotIds } } })
      : [];
    const byId = new Map(lots.map((l) => [l.id, l]));
    return rows.map((balance) => {
      const lot = balance.lotId ? byId.get(balance.lotId) : undefined;
      return {
        balance,
        lotNumber: lot?.lotNumber ?? null,
        expiryDate: lot?.expiryDate ? toIsoDate(lot.expiryDate) : null,
      };
    });
  }

  async listForItem(
    tenantId: string,
    warehouseId: string,
    itemId: string,
  ): Promise<readonly BalanceWithLot[]> {
    const rows = await this.txm
      .getClient()
      .stockBalance.findMany({ where: { tenantId, warehouseId, itemId } });
    return this.decorate(rows);
  }

  async listByItem(
    tenantId: string,
    itemId: string,
  ): Promise<readonly BalanceWithLot[]> {
    const rows = await this.txm.getClient().stockBalance.findMany({
      where: { tenantId, itemId },
      orderBy: { warehouseId: 'asc' },
    });
    return this.decorate(rows);
  }

  async listByWarehouse(
    tenantId: string,
    warehouseId: string,
    page: { limit: number; offset: number },
  ) {
    const client = this.txm.getClient();
    const where = { tenantId, warehouseId };
    const [rows, total] = await Promise.all([
      client.stockBalance.findMany({
        where,
        orderBy: { itemId: 'asc' },
        skip: page.offset,
        take: page.limit,
      }),
      client.stockBalance.count({ where }),
    ]);
    return { items: await this.decorate(rows), total };
  }

  async findByKey(
    tenantId: string,
    warehouseId: string,
    itemId: string,
    lotId: string | null,
  ) {
    return this.txm.getClient().stockBalance.findFirst({
      where: { tenantId, warehouseId, itemId, lotId },
    });
  }

  async create(b: StockBalanceSnapshot): Promise<void> {
    await this.txm.getClient().stockBalance.create({ data: b });
  }

  async save(b: StockBalanceSnapshot): Promise<StockBalanceSnapshot> {
    const client = this.txm.getClient();
    const r = await client.stockBalance.updateMany({
      where: { id: b.id, tenantId: b.tenantId, version: b.version },
      data: {
        onHandQty: b.onHandQty,
        reservedQty: b.reservedQty,
        version: b.version + 1,
      },
    });
    if (r.count !== 1) {
      const actual = await client.stockBalance.findFirst({
        where: { id: b.id },
        select: { version: true },
      });
      throw new InventoryVersionConflictError(
        b.id,
        b.version,
        actual?.version ?? -1,
      );
    }
    return { ...b, version: b.version + 1 };
  }
}

@Injectable()
export class PrismaStockMovementRepository implements StockMovementRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async append(m: StockMovementSnapshot): Promise<void> {
    await this.txm.getClient().stockMovement.create({
      data: {
        ...m,
        serialNumbers: m.serialNumbers.length
          ? JSON.stringify(m.serialNumbers)
          : null,
      },
    });
  }

  async list(tenantId: string, f: MovementFilter) {
    const client = this.txm.getClient();
    const where = {
      tenantId,
      ...(f.itemId ? { itemId: f.itemId } : {}),
      ...(f.warehouseId ? { warehouseId: f.warehouseId } : {}),
      ...(f.referenceType ? { referenceType: f.referenceType } : {}),
      ...(f.referenceId ? { referenceId: f.referenceId } : {}),
    };
    const [rows, total] = await Promise.all([
      client.stockMovement.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: f.offset,
        take: f.limit,
      }),
      client.stockMovement.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        ...r,
        type: isMovementType(r.type) ? r.type : 'ADJUST_OUT',
        serialNumbers: r.serialNumbers
          ? (JSON.parse(r.serialNumbers) as string[])
          : [],
      })),
      total,
    };
  }
}

@Injectable()
export class PrismaCostRepository implements CostRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async openLayers(
    tenantId: string,
    warehouseId: string,
    itemId: string,
    lotId: string | null,
  ) {
    return this.txm.getClient().costLayer.findMany({
      where: {
        tenantId,
        warehouseId,
        itemId,
        remainingQty: { gt: 0n },
        ...(lotId ? { lotId } : {}),
      },
      orderBy: { receivedAt: 'asc' },
    });
  }

  async listLayersByItem(tenantId: string, itemId: string) {
    return this.txm.getClient().costLayer.findMany({
      where: { tenantId, itemId },
      orderBy: { receivedAt: 'asc' },
    });
  }

  async createLayer(layer: CostLayerSnapshot): Promise<void> {
    await this.txm.getClient().costLayer.create({ data: layer });
  }

  async saveLayers(layers: readonly CostLayerSnapshot[]): Promise<void> {
    const client = this.txm.getClient();
    for (const l of layers) {
      await client.costLayer.update({
        where: { id: l.id },
        data: { remainingQty: l.remainingQty },
      });
    }
  }

  async findAverage(tenantId: string, itemId: string) {
    return this.txm
      .getClient()
      .averageCost.findFirst({ where: { tenantId, itemId } });
  }

  async saveAverage(avg: AverageCostSnapshot): Promise<AverageCostSnapshot> {
    const client = this.txm.getClient();
    if (avg.version === 0) {
      const existing = await client.averageCost.findFirst({
        where: { id: avg.id },
        select: { id: true },
      });
      if (!existing) {
        await client.averageCost.create({ data: { ...avg, version: 1 } });
        return { ...avg, version: 1 };
      }
    }
    const r = await client.averageCost.updateMany({
      where: { id: avg.id, version: avg.version },
      data: {
        quantity: avg.quantity,
        totalCostMinor: avg.totalCostMinor,
        unitCostMinor: avg.unitCostMinor,
        version: avg.version + 1,
      },
    });
    if (r.count !== 1) {
      const actual = await client.averageCost.findFirst({
        where: { id: avg.id },
        select: { version: true },
      });
      throw new InventoryVersionConflictError(
        avg.id,
        avg.version,
        actual?.version ?? -1,
      );
    }
    return { ...avg, version: avg.version + 1 };
  }
}

@Injectable()
export class PrismaSerialRepository implements SerialRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  private toUnit(r: {
    id: string;
    tenantId: string;
    itemId: string;
    serialNumber: string;
    warehouseId: string | null;
    lotId: string | null;
    status: string;
    lastMovementId: string | null;
    createdAt: Date;
  }): SerialUnitSnapshot {
    return { ...r, status: isSerialStatus(r.status) ? r.status : 'ISSUED' };
  }

  async findMany(
    tenantId: string,
    itemId: string,
    serialNumbers: readonly string[],
  ) {
    if (serialNumbers.length === 0) return [];
    const rows = await this.txm.getClient().serialUnit.findMany({
      where: { tenantId, itemId, serialNumber: { in: [...serialNumbers] } },
    });
    return rows.map((r) => this.toUnit(r));
  }

  async findBySerial(tenantId: string, serialNumber: string) {
    const rows = await this.txm
      .getClient()
      .serialUnit.findMany({ where: { tenantId, serialNumber } });
    return rows.map((r) => this.toUnit(r));
  }

  async upsertMany(units: readonly SerialUnitSnapshot[]): Promise<void> {
    const client = this.txm.getClient();
    for (const u of units) {
      await client.serialUnit.upsert({
        where: { id: u.id },
        create: u,
        update: {
          warehouseId: u.warehouseId,
          lotId: u.lotId,
          status: u.status,
          lastMovementId: u.lastMovementId,
        },
      });
    }
  }
}

@Injectable()
export class PrismaReservationRepository implements ReservationRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async listActive(
    tenantId: string,
    referenceType: string,
    referenceId: string,
  ) {
    const rows = await this.txm.getClient().stockReservation.findMany({
      where: { tenantId, referenceType, referenceId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      ...r,
      status: r.status as ReservationSnapshot['status'],
    }));
  }

  async create(r: ReservationSnapshot): Promise<void> {
    await this.txm.getClient().stockReservation.create({ data: r });
  }

  async save(r: ReservationSnapshot): Promise<void> {
    await this.txm.getClient().stockReservation.update({
      where: { id: r.id },
      data: { quantity: r.quantity, status: r.status },
    });
  }
}

const withLines = { lines: { orderBy: { lineNo: 'asc' as const } } };

@Injectable()
export class PrismaTransferRepository implements TransferRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  private toEntity(r: {
    id: string;
    tenantId: string;
    number: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    status: string;
    notes: string | null;
    version: number;
    createdBy: string;
    shippedAt: Date | null;
    receivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    lines: Array<{
      id: string;
      lineNo: number;
      itemId: string;
      itemSku: string;
      lotId: string | null;
      uomCode: string;
      quantity: bigint;
      unitCostMinor: bigint;
      serialNumbers: string | null;
    }>;
  }): StockTransfer {
    return StockTransfer.fromSnapshot({
      ...r,
      status: isTransferStatus(r.status) ? r.status : TransferStatus.Cancelled,
      lines: r.lines.map((l) => ({
        ...l,
        serialNumbers: l.serialNumbers
          ? (JSON.parse(l.serialNumbers) as string[])
          : [],
      })),
    });
  }

  async findById(tenantId: string, id: string): Promise<StockTransfer | null> {
    const r = await this.txm
      .getClient()
      .stockTransfer.findFirst({ where: { tenantId, id }, include: withLines });
    return r ? this.toEntity(r) : null;
  }

  async list(
    tenantId: string,
    f: { status?: TransferStatus | null; limit: number; offset: number },
  ) {
    const client = this.txm.getClient();
    const where = { tenantId, ...(f.status ? { status: f.status } : {}) };
    const [rows, total] = await Promise.all([
      client.stockTransfer.findMany({
        where,
        include: withLines,
        orderBy: { createdAt: 'desc' },
        skip: f.offset,
        take: f.limit,
      }),
      client.stockTransfer.count({ where }),
    ]);
    return { items: rows.map((r) => this.toEntity(r)), total };
  }

  async create(t: StockTransfer): Promise<void> {
    const s = t.snapshot();
    await this.txm.getClient().stockTransfer.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        number: s.number,
        fromWarehouseId: s.fromWarehouseId,
        toWarehouseId: s.toWarehouseId,
        status: s.status,
        notes: s.notes,
        version: s.version,
        createdBy: s.createdBy,
        shippedAt: s.shippedAt,
        receivedAt: s.receivedAt,
        createdAt: s.createdAt,
        lines: {
          create: s.lines.map((l) => ({
            id: l.id,
            tenantId: s.tenantId,
            lineNo: l.lineNo,
            itemId: l.itemId,
            itemSku: l.itemSku,
            lotId: l.lotId,
            uomCode: l.uomCode,
            quantity: l.quantity,
            unitCostMinor: l.unitCostMinor,
            serialNumbers: l.serialNumbers.length
              ? JSON.stringify(l.serialNumbers)
              : null,
          })),
        },
      },
    });
  }

  async save(t: StockTransfer): Promise<StockTransfer> {
    const s = t.snapshot();
    const client = this.txm.getClient();
    const r = await client.stockTransfer.updateMany({
      where: { tenantId: s.tenantId, id: s.id, version: s.version },
      data: {
        status: s.status,
        notes: s.notes,
        shippedAt: s.shippedAt,
        receivedAt: s.receivedAt,
        version: s.version + 1,
      },
    });
    if (r.count !== 1) {
      const actual = await client.stockTransfer.findFirst({
        where: { id: s.id },
        select: { version: true },
      });
      throw new InventoryVersionConflictError(
        s.id,
        s.version,
        actual?.version ?? -1,
      );
    }
    for (const l of s.lines) {
      await client.stockTransferLine.update({
        where: { id: l.id },
        data: { unitCostMinor: l.unitCostMinor },
      });
    }
    return StockTransfer.fromSnapshot({ ...s, version: s.version + 1 });
  }
}
