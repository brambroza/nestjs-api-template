import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import { fromIsoDate, toIsoDate } from '../../../../shared/domain';
import {
  GoodsReceipt,
  GoodsReceiptStatus,
  PurchaseVersionConflictError,
  isGoodsReceiptStatus,
  type GoodsReceiptSnapshot,
} from '../domain';
import type { GoodsReceiptRepository } from '../application/ports/goods-receipt.repository';

const withLines = { lines: { orderBy: { lineNo: 'asc' as const } } };

interface Row {
  id: string;
  tenantId: string;
  purchaseOrderId: string;
  number: string;
  status: string;
  receiptDate: Date;
  warehouseId: string;
  vendorDeliveryRef: string | null;
  notes: string | null;
  version: number;
  createdBy: string;
  postedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lines: Array<{
    id: string;
    lineNo: number;
    purchaseOrderLineId: string;
    itemId: string;
    itemSku: string;
    uomCode: string;
    quantity: bigint;
    lotNumber: string | null;
    expiryDate: Date | null;
  }>;
}

function toSnapshot(r: Row): GoodsReceiptSnapshot {
  return {
    id: r.id,
    tenantId: r.tenantId,
    purchaseOrderId: r.purchaseOrderId,
    number: r.number,
    status: isGoodsReceiptStatus(r.status)
      ? r.status
      : GoodsReceiptStatus.Cancelled,
    receiptDate: toIsoDate(r.receiptDate),
    warehouseId: r.warehouseId,
    vendorDeliveryRef: r.vendorDeliveryRef,
    notes: r.notes,
    version: r.version,
    createdBy: r.createdBy,
    postedAt: r.postedAt,
    lines: r.lines.map((l) => ({
      id: l.id,
      lineNo: l.lineNo,
      purchaseOrderLineId: l.purchaseOrderLineId,
      itemId: l.itemId,
      itemSku: l.itemSku,
      uomCode: l.uomCode,
      quantity: l.quantity,
      lotNumber: l.lotNumber,
      expiryDate: l.expiryDate ? toIsoDate(l.expiryDate) : null,
    })),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class PrismaGoodsReceiptRepository implements GoodsReceiptRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findById(tenantId: string, id: string): Promise<GoodsReceipt | null> {
    const row = await this.txm.getClient().goodsReceipt.findFirst({
      where: { tenantId, id },
      include: withLines,
    });
    return row ? GoodsReceipt.fromSnapshot(toSnapshot(row)) : null;
  }

  async listForOrder(
    tenantId: string,
    purchaseOrderId: string,
  ): Promise<readonly GoodsReceipt[]> {
    const rows = await this.txm.getClient().goodsReceipt.findMany({
      where: { tenantId, purchaseOrderId },
      include: withLines,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => GoodsReceipt.fromSnapshot(toSnapshot(r)));
  }

  async create(g: GoodsReceipt): Promise<void> {
    const s = g.snapshot();
    await this.txm.getClient().goodsReceipt.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        purchaseOrderId: s.purchaseOrderId,
        number: s.number,
        status: s.status,
        receiptDate: fromIsoDate(s.receiptDate),
        warehouseId: s.warehouseId,
        vendorDeliveryRef: s.vendorDeliveryRef,
        notes: s.notes,
        version: s.version,
        createdBy: s.createdBy,
        postedAt: s.postedAt,
        createdAt: s.createdAt,
        lines: {
          create: s.lines.map((l) => ({
            id: l.id,
            tenantId: s.tenantId,
            lineNo: l.lineNo,
            purchaseOrderLineId: l.purchaseOrderLineId,
            itemId: l.itemId,
            itemSku: l.itemSku,
            uomCode: l.uomCode,
            quantity: l.quantity,
            lotNumber: l.lotNumber,
            expiryDate: l.expiryDate ? fromIsoDate(l.expiryDate) : null,
          })),
        },
      },
    });
  }

  /** Lines are immutable after creation; only the header changes (status, postedAt). */
  async save(g: GoodsReceipt): Promise<GoodsReceipt> {
    const s = g.snapshot();
    const client = this.txm.getClient();
    const result = await client.goodsReceipt.updateMany({
      where: { tenantId: s.tenantId, id: s.id, version: s.version },
      data: {
        status: s.status,
        receiptDate: fromIsoDate(s.receiptDate),
        warehouseId: s.warehouseId,
        vendorDeliveryRef: s.vendorDeliveryRef,
        notes: s.notes,
        postedAt: s.postedAt,
        version: s.version + 1,
      },
    });
    if (result.count !== 1) {
      const actual = await client.goodsReceipt.findFirst({
        where: { tenantId: s.tenantId, id: s.id },
        select: { version: true },
      });
      throw new PurchaseVersionConflictError(
        s.id,
        s.version,
        actual?.version ?? -1,
      );
    }
    return GoodsReceipt.fromSnapshot({ ...s, version: s.version + 1 });
  }
}
