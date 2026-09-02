import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import { fromIsoDate, toIsoDate } from '../../../../shared/domain';
import {
  DeliveryNote,
  DeliveryNoteStatus,
  DeliveryNoteVersionConflictError,
  isDeliveryNoteStatus,
  type DeliveryNoteSnapshot,
} from '../domain';
import type { DeliveryNoteRepository } from '../application/ports/delivery-note.repository';

const withLines = { lines: { orderBy: { lineNo: 'asc' as const } } };

interface Row {
  id: string;
  tenantId: string;
  salesOrderId: string;
  number: string;
  status: string;
  deliveryDate: Date;
  warehouseId: string | null;
  shipToAddress: string | null;
  notes: string | null;
  version: number;
  createdBy: string;
  shippedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lines: Array<{
    id: string;
    lineNo: number;
    salesOrderLineId: string;
    itemId: string;
    itemSku: string;
    uomCode: string;
    quantity: bigint;
  }>;
}

function toSnapshot(r: Row): DeliveryNoteSnapshot {
  return {
    id: r.id,
    tenantId: r.tenantId,
    salesOrderId: r.salesOrderId,
    number: r.number,
    status: isDeliveryNoteStatus(r.status)
      ? r.status
      : DeliveryNoteStatus.Cancelled,
    deliveryDate: toIsoDate(r.deliveryDate),
    warehouseId: r.warehouseId,
    shipToAddress: r.shipToAddress,
    notes: r.notes,
    version: r.version,
    createdBy: r.createdBy,
    shippedAt: r.shippedAt,
    lines: r.lines.map((l) => ({
      id: l.id,
      lineNo: l.lineNo,
      salesOrderLineId: l.salesOrderLineId,
      itemId: l.itemId,
      itemSku: l.itemSku,
      uomCode: l.uomCode,
      quantity: l.quantity,
    })),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class PrismaDeliveryNoteRepository implements DeliveryNoteRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findById(tenantId: string, id: string): Promise<DeliveryNote | null> {
    const row = await this.txm.getClient().deliveryNote.findFirst({
      where: { tenantId, id },
      include: withLines,
    });
    return row ? DeliveryNote.fromSnapshot(toSnapshot(row)) : null;
  }

  async listForOrder(
    tenantId: string,
    salesOrderId: string,
  ): Promise<readonly DeliveryNote[]> {
    const rows = await this.txm.getClient().deliveryNote.findMany({
      where: { tenantId, salesOrderId },
      include: withLines,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => DeliveryNote.fromSnapshot(toSnapshot(r)));
  }

  async create(n: DeliveryNote): Promise<void> {
    const s = n.snapshot();
    await this.txm.getClient().deliveryNote.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        salesOrderId: s.salesOrderId,
        number: s.number,
        status: s.status,
        deliveryDate: fromIsoDate(s.deliveryDate),
        warehouseId: s.warehouseId,
        shipToAddress: s.shipToAddress,
        notes: s.notes,
        version: s.version,
        createdBy: s.createdBy,
        shippedAt: s.shippedAt,
        createdAt: s.createdAt,
        lines: {
          create: s.lines.map((l) => ({
            id: l.id,
            tenantId: s.tenantId,
            lineNo: l.lineNo,
            salesOrderLineId: l.salesOrderLineId,
            itemId: l.itemId,
            itemSku: l.itemSku,
            uomCode: l.uomCode,
            quantity: l.quantity,
          })),
        },
      },
    });
  }

  /** Lines are immutable after creation; only the header changes (status, shippedAt). */
  async save(n: DeliveryNote): Promise<DeliveryNote> {
    const s = n.snapshot();
    const client = this.txm.getClient();
    const result = await client.deliveryNote.updateMany({
      where: { tenantId: s.tenantId, id: s.id, version: s.version },
      data: {
        status: s.status,
        deliveryDate: fromIsoDate(s.deliveryDate),
        warehouseId: s.warehouseId,
        shipToAddress: s.shipToAddress,
        notes: s.notes,
        shippedAt: s.shippedAt,
        version: s.version + 1,
      },
    });
    if (result.count !== 1) {
      const actual = await client.deliveryNote.findFirst({
        where: { tenantId: s.tenantId, id: s.id },
        select: { version: true },
      });
      throw new DeliveryNoteVersionConflictError(
        s.id,
        s.version,
        actual?.version ?? -1,
      );
    }
    return DeliveryNote.fromSnapshot({ ...s, version: s.version + 1 });
  }
}
