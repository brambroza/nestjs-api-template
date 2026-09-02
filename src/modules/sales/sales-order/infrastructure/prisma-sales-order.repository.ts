import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import {
  fromIsoDate,
  isPriceSource,
  toIsoDate,
} from '../../../../shared/domain';
import {
  CreditStatus,
  OPEN_EXPOSURE_STATUSES,
  SalesOrder,
  SalesOrderStatus,
  SalesOrderVersionConflictError,
  isCreditStatus,
  isSalesOrderStatus,
  type SalesOrderLineSnapshot,
  type SalesOrderSnapshot,
} from '../domain';
import type {
  ListSalesOrdersFilter,
  ListSalesOrdersPage,
  SalesOrderRepository,
} from '../application/ports/sales-order.repository';

const withLines = { lines: { orderBy: { lineNo: 'asc' as const } } };

interface LineRow {
  id: string;
  lineNo: number;
  itemId: string;
  itemSku: string;
  description: string;
  uomCode: string;
  quantity: bigint;
  deliveredQty: bigint;
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
  quotationId: string | null;
  customerId: string;
  currency: string;
  orderDate: Date;
  requestedDeliveryDate: Date | null;
  status: string;
  paymentTermsDays: number;
  notes: string | null;
  subtotalMinor: bigint;
  discountMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  creditStatus: string;
  creditExposureMinor: bigint;
  approvalRequestId: string | null;
  version: number;
  createdBy: string;
  submittedAt: Date | null;
  confirmedAt: Date | null;
  resolvedAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  lines: LineRow[];
}

function toLine(r: LineRow): SalesOrderLineSnapshot {
  return {
    id: r.id,
    lineNo: r.lineNo,
    itemId: r.itemId,
    itemSku: r.itemSku,
    description: r.description,
    uomCode: r.uomCode,
    quantity: r.quantity,
    deliveredQty: r.deliveredQty,
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

function toSnapshot(r: HeaderRow): SalesOrderSnapshot {
  return {
    id: r.id,
    tenantId: r.tenantId,
    companyId: r.companyId,
    number: r.number,
    quotationId: r.quotationId,
    customerId: r.customerId,
    currency: r.currency,
    orderDate: toIsoDate(r.orderDate),
    requestedDeliveryDate: r.requestedDeliveryDate
      ? toIsoDate(r.requestedDeliveryDate)
      : null,
    status: isSalesOrderStatus(r.status)
      ? r.status
      : SalesOrderStatus.Cancelled,
    paymentTermsDays: r.paymentTermsDays,
    notes: r.notes,
    subtotalMinor: r.subtotalMinor,
    discountMinor: r.discountMinor,
    taxMinor: r.taxMinor,
    totalMinor: r.totalMinor,
    creditStatus: isCreditStatus(r.creditStatus)
      ? r.creditStatus
      : CreditStatus.NotChecked,
    creditExposureMinor: r.creditExposureMinor,
    approvalRequestId: r.approvalRequestId,
    version: r.version,
    createdBy: r.createdBy,
    submittedAt: r.submittedAt,
    confirmedAt: r.confirmedAt,
    resolvedAt: r.resolvedAt,
    cancelReason: r.cancelReason,
    lines: r.lines.map(toLine),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function headerData(s: SalesOrderSnapshot) {
  return {
    companyId: s.companyId,
    number: s.number,
    quotationId: s.quotationId,
    customerId: s.customerId,
    currency: s.currency,
    orderDate: fromIsoDate(s.orderDate),
    requestedDeliveryDate: s.requestedDeliveryDate
      ? fromIsoDate(s.requestedDeliveryDate)
      : null,
    status: s.status,
    paymentTermsDays: s.paymentTermsDays,
    notes: s.notes,
    subtotalMinor: s.subtotalMinor,
    discountMinor: s.discountMinor,
    taxMinor: s.taxMinor,
    totalMinor: s.totalMinor,
    creditStatus: s.creditStatus,
    creditExposureMinor: s.creditExposureMinor,
    approvalRequestId: s.approvalRequestId,
    createdBy: s.createdBy,
    submittedAt: s.submittedAt,
    confirmedAt: s.confirmedAt,
    resolvedAt: s.resolvedAt,
    cancelReason: s.cancelReason,
  };
}

function lineData(
  tenantId: string,
  salesOrderId: string,
  l: SalesOrderLineSnapshot,
) {
  return {
    id: l.id,
    tenantId,
    salesOrderId,
    lineNo: l.lineNo,
    itemId: l.itemId,
    itemSku: l.itemSku,
    description: l.description,
    uomCode: l.uomCode,
    quantity: l.quantity,
    deliveredQty: l.deliveredQty,
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
export class PrismaSalesOrderRepository implements SalesOrderRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findById(tenantId: string, id: string): Promise<SalesOrder | null> {
    const row = await this.txm.getClient().salesOrder.findFirst({
      where: { tenantId, id },
      include: withLines,
    });
    return row ? SalesOrder.fromSnapshot(toSnapshot(row)) : null;
  }

  async list(
    tenantId: string,
    f: ListSalesOrdersFilter,
  ): Promise<ListSalesOrdersPage> {
    const client = this.txm.getClient();
    const where = {
      tenantId,
      ...(f.status ? { status: f.status } : {}),
      ...(f.customerId ? { customerId: f.customerId } : {}),
    };
    const [rows, total] = await Promise.all([
      client.salesOrder.findMany({
        where,
        include: withLines,
        orderBy: { createdAt: 'desc' },
        skip: f.offset,
        take: f.limit,
      }),
      client.salesOrder.count({ where }),
    ]);
    return {
      items: rows.map((r) => SalesOrder.fromSnapshot(toSnapshot(r))),
      total,
    };
  }

  async create(so: SalesOrder): Promise<void> {
    const s = so.snapshot();
    await this.txm.getClient().salesOrder.create({
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

  async save(so: SalesOrder): Promise<SalesOrder> {
    const s = so.snapshot();
    const client = this.txm.getClient();
    const result = await client.salesOrder.updateMany({
      where: { tenantId: s.tenantId, id: s.id, version: s.version },
      data: { ...headerData(s), version: s.version + 1 },
    });
    if (result.count !== 1) {
      const actual = await client.salesOrder.findFirst({
        where: { tenantId: s.tenantId, id: s.id },
        select: { version: true },
      });
      throw new SalesOrderVersionConflictError(
        s.id,
        s.version,
        actual?.version ?? -1,
      );
    }
    await client.salesOrderLine.deleteMany({ where: { salesOrderId: s.id } });
    if (s.lines.length > 0) {
      await client.salesOrderLine.createMany({
        data: s.lines.map((l) => lineData(s.tenantId, s.id, l)),
      });
    }
    return SalesOrder.fromSnapshot({ ...s, version: s.version + 1 });
  }

  async sumOpenExposure(
    tenantId: string,
    customerId: string,
    currency: string,
    excludeOrderId: string | null,
  ): Promise<bigint> {
    const agg = await this.txm.getClient().salesOrder.aggregate({
      where: {
        tenantId,
        customerId,
        currency,
        status: { in: [...OPEN_EXPOSURE_STATUSES] },
        ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
      },
      _sum: { totalMinor: true },
    });
    return agg._sum.totalMinor ?? 0n;
  }
}
