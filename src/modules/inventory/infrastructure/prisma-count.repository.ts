import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../shared/database';
import {
  CountStatus,
  InventoryVersionConflictError,
  StockCount,
  isCountStatus,
  type CountLineSnapshot,
} from '../domain';
import type { CountRepository } from '../application/ports/count.repository';

const withLines = { lines: { orderBy: { lineNo: 'asc' as const } } };

@Injectable()
export class PrismaCountRepository implements CountRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  private toEntity(r: {
    id: string;
    tenantId: string;
    number: string;
    warehouseId: string;
    status: string;
    notes: string | null;
    approvalRequestId: string | null;
    version: number;
    createdBy: string;
    countedAt: Date | null;
    postedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    lines: CountLineSnapshot[];
  }): StockCount {
    return StockCount.fromSnapshot({
      ...r,
      status: isCountStatus(r.status) ? r.status : CountStatus.Cancelled,
    });
  }

  async findById(tenantId: string, id: string): Promise<StockCount | null> {
    const r = await this.txm
      .getClient()
      .stockCount.findFirst({ where: { tenantId, id }, include: withLines });
    return r ? this.toEntity(r) : null;
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
    const client = this.txm.getClient();
    const where = {
      tenantId,
      ...(f.warehouseId ? { warehouseId: f.warehouseId } : {}),
      ...(f.status ? { status: f.status } : {}),
    };
    const [rows, total] = await Promise.all([
      client.stockCount.findMany({
        where,
        include: withLines,
        orderBy: { createdAt: 'desc' },
        skip: f.offset,
        take: f.limit,
      }),
      client.stockCount.count({ where }),
    ]);
    return { items: rows.map((r) => this.toEntity(r)), total };
  }

  async create(c: StockCount): Promise<void> {
    const s = c.snapshot();
    await this.txm.getClient().stockCount.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        number: s.number,
        warehouseId: s.warehouseId,
        status: s.status,
        notes: s.notes,
        approvalRequestId: s.approvalRequestId,
        version: s.version,
        createdBy: s.createdBy,
        countedAt: s.countedAt,
        postedAt: s.postedAt,
        createdAt: s.createdAt,
        lines: { create: s.lines.map((l) => ({ ...l, tenantId: s.tenantId })) },
      },
    });
  }

  async save(c: StockCount): Promise<StockCount> {
    const s = c.snapshot();
    const client = this.txm.getClient();
    const r = await client.stockCount.updateMany({
      where: { tenantId: s.tenantId, id: s.id, version: s.version },
      data: {
        status: s.status,
        notes: s.notes,
        approvalRequestId: s.approvalRequestId,
        countedAt: s.countedAt,
        postedAt: s.postedAt,
        version: s.version + 1,
      },
    });
    if (r.count !== 1) {
      const actual = await client.stockCount.findFirst({
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
      await client.stockCountLine.update({
        where: { id: l.id },
        data: { countedQty: l.countedQty, varianceQty: l.varianceQty },
      });
    }
    return StockCount.fromSnapshot({ ...s, version: s.version + 1 });
  }
}
