import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import {
  fromIsoDate,
  isPriceSource,
  toIsoDate,
} from '../../../../shared/domain';
import {
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseVersionConflictError,
  isPurchaseOrderStatus,
  type PurchaseOrderLineSnapshot,
  type PurchaseOrderSnapshot,
} from '../domain';
import type {
  ListPurchaseOrdersFilter,
  ListPurchaseOrdersPage,
  PurchaseOrderRepository,
} from '../application/ports/purchase-order.repository';

const withLines = { lines: { orderBy: { lineNo: 'asc' as const } } };

interface LineRow {
  id: string;
  lineNo: number;
  itemId: string;
  itemSku: string;
  description: string;
  uomCode: string;
  quantity: bigint;
  receivedQty: bigint;
  unitPriceMinor: bigint;
  priceSource: string;
  priceListId: string | null;
  discountBp: number;
  discountMinor: bigint;
  netMinor: bigint;
  taxCodeId: string;
  taxCode: string;
  taxRateBp: number;
  taxMinor: bigint;
  totalMinor: bigint;
}

interface HeaderRow {
  id: string;
  tenantId: string;
  companyId: string;
  number: string;
  requisitionId: string | null;
  vendorId: string;
  currency: string;
  orderDate: Date;
  expectedDate: Date | null;
  status: string;
  paymentTermsDays: number;
  notes: string | null;
  subtotalMinor: bigint;
  discountMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  approvalRequestId: string | null;
  version: number;
  createdBy: string;
  submittedAt: Date | null;
  issuedAt: Date | null;
  resolvedAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  lines: LineRow[];
}

function toLine(r: LineRow): PurchaseOrderLineSnapshot {
  return {
    id: r.id,
    lineNo: r.lineNo,
    itemId: r.itemId,
    itemSku: r.itemSku,
    description: r.description,
    uomCode: r.uomCode,
    quantity: r.quantity,
    receivedQty: r.receivedQty,
    unitPriceMinor: r.unitPriceMinor,
    priceSource: isPriceSource(r.priceSource) ? r.priceSource : 'MANUAL',
    priceListId: r.priceListId,
    discountBp: r.discountBp,
    discountMinor: r.discountMinor,
    netMinor: r.netMinor,
    taxCodeId: r.taxCodeId,
    taxCode: r.taxCode,
    taxRateBp: r.taxRateBp,
    taxMinor: r.taxMinor,
    totalMinor: r.totalMinor,
  };
}

function toSnapshot(r: HeaderRow): PurchaseOrderSnapshot {
  return {
    id: r.id,
    tenantId: r.tenantId,
    companyId: r.companyId,
    number: r.number,
    requisitionId: r.requisitionId,
    vendorId: r.vendorId,
    currency: r.currency,
    orderDate: toIsoDate(r.orderDate),
    expectedDate: r.expectedDate ? toIsoDate(r.expectedDate) : null,
    status: isPurchaseOrderStatus(r.status)
      ? r.status
      : PurchaseOrderStatus.Cancelled,
    paymentTermsDays: r.paymentTermsDays,
    notes: r.notes,
    subtotalMinor: r.subtotalMinor,
    discountMinor: r.discountMinor,
    taxMinor: r.taxMinor,
    totalMinor: r.totalMinor,
    approvalRequestId: r.approvalRequestId,
    version: r.version,
    createdBy: r.createdBy,
    submittedAt: r.submittedAt,
    issuedAt: r.issuedAt,
    resolvedAt: r.resolvedAt,
    cancelReason: r.cancelReason,
    lines: r.lines.map(toLine),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function headerData(s: PurchaseOrderSnapshot) {
  return {
    companyId: s.companyId,
    number: s.number,
    requisitionId: s.requisitionId,
    vendorId: s.vendorId,
    currency: s.currency,
    orderDate: fromIsoDate(s.orderDate),
    expectedDate: s.expectedDate ? fromIsoDate(s.expectedDate) : null,
    status: s.status,
    paymentTermsDays: s.paymentTermsDays,
    notes: s.notes,
    subtotalMinor: s.subtotalMinor,
    discountMinor: s.discountMinor,
    taxMinor: s.taxMinor,
    totalMinor: s.totalMinor,
    approvalRequestId: s.approvalRequestId,
    createdBy: s.createdBy,
    submittedAt: s.submittedAt,
    issuedAt: s.issuedAt,
    resolvedAt: s.resolvedAt,
    cancelReason: s.cancelReason,
  };
}

function lineData(
  tenantId: string,
  purchaseOrderId: string,
  l: PurchaseOrderLineSnapshot,
) {
  return {
    id: l.id,
    tenantId,
    purchaseOrderId,
    lineNo: l.lineNo,
    itemId: l.itemId,
    itemSku: l.itemSku,
    description: l.description,
    uomCode: l.uomCode,
    quantity: l.quantity,
    receivedQty: l.receivedQty,
    unitPriceMinor: l.unitPriceMinor,
    priceSource: l.priceSource,
    priceListId: l.priceListId,
    discountBp: l.discountBp,
    discountMinor: l.discountMinor,
    netMinor: l.netMinor,
    taxCodeId: l.taxCodeId,
    taxCode: l.taxCode,
    taxRateBp: l.taxRateBp,
    taxMinor: l.taxMinor,
    totalMinor: l.totalMinor,
  };
}

@Injectable()
export class PrismaPurchaseOrderRepository implements PurchaseOrderRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findById(tenantId: string, id: string): Promise<PurchaseOrder | null> {
    const row = await this.txm.getClient().purchaseOrder.findFirst({
      where: { tenantId, id },
      include: withLines,
    });
    return row ? PurchaseOrder.fromSnapshot(toSnapshot(row)) : null;
  }

  async list(
    tenantId: string,
    f: ListPurchaseOrdersFilter,
  ): Promise<ListPurchaseOrdersPage> {
    const client = this.txm.getClient();
    const where = {
      tenantId,
      ...(f.status ? { status: f.status } : {}),
      ...(f.vendorId ? { vendorId: f.vendorId } : {}),
    };
    const [rows, total] = await Promise.all([
      client.purchaseOrder.findMany({
        where,
        include: withLines,
        orderBy: { createdAt: 'desc' },
        skip: f.offset,
        take: f.limit,
      }),
      client.purchaseOrder.count({ where }),
    ]);
    return {
      items: rows.map((r) => PurchaseOrder.fromSnapshot(toSnapshot(r))),
      total,
    };
  }

  async create(po: PurchaseOrder): Promise<void> {
    const s = po.snapshot();
    await this.txm.getClient().purchaseOrder.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        ...headerData(s),
        version: s.version,
        createdAt: s.createdAt,
        lines: { create: s.lines.map((l) => lineData(s.tenantId, s.id, l)) },
      },
    });
  }

  async save(po: PurchaseOrder): Promise<PurchaseOrder> {
    const s = po.snapshot();
    const client = this.txm.getClient();
    const result = await client.purchaseOrder.updateMany({
      where: { tenantId: s.tenantId, id: s.id, version: s.version },
      data: { ...headerData(s), version: s.version + 1 },
    });
    if (result.count !== 1) {
      const actual = await client.purchaseOrder.findFirst({
        where: { tenantId: s.tenantId, id: s.id },
        select: { version: true },
      });
      throw new PurchaseVersionConflictError(
        s.id,
        s.version,
        actual?.version ?? -1,
      );
    }
    await client.purchaseOrderLine.deleteMany({
      where: { purchaseOrderId: s.id },
    });
    if (s.lines.length > 0) {
      await client.purchaseOrderLine.createMany({
        data: s.lines.map((l) => lineData(s.tenantId, s.id, l)),
      });
    }
    return PurchaseOrder.fromSnapshot({ ...s, version: s.version + 1 });
  }
}
