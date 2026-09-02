import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import {
  fromIsoDate,
  isPriceSource,
  toIsoDate,
  type IsoDate,
} from '../../../../shared/domain';
import {
  ArVersionConflictError,
  InvoiceStatus,
  InvoiceType,
  OPEN_STATUSES,
  Receipt,
  ReceiptMethod,
  ReceiptStatus,
  SalesInvoice,
  isInvoiceStatus,
  isInvoiceType,
  isNoteReason,
  isReceiptMethod,
  isReceiptStatus,
  type SalesInvoiceLineSnapshot,
  type SalesInvoiceSnapshot,
} from '../domain';
import type {
  InvoiceFilter,
  ReceiptFilter,
  ReceiptRepository,
  SalesInvoiceRepository,
} from '../application/ports';

const withLines = { lines: { orderBy: { lineNo: 'asc' as const } } };

interface LineRow {
  id: string;
  lineNo: number;
  itemId: string;
  itemSku: string;
  description: string;
  uomCode: string;
  quantity: bigint;
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
  salesOrderLineId: string | null;
}

interface InvoiceRow {
  id: string;
  tenantId: string;
  companyId: string;
  branchId: string;
  number: string | null;
  type: string;
  originalInvoiceId: string | null;
  reason: string | null;
  reasonText: string | null;
  customerId: string;
  customerName: string;
  customerTaxId: string | null;
  customerBranchNumber: string | null;
  billingAddress: string | null;
  salesOrderId: string | null;
  currency: string;
  invoiceDate: Date;
  dueDate: Date;
  paymentTermsDays: number;
  status: string;
  subtotalMinor: bigint;
  discountMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  settledMinor: bigint;
  balanceMinor: bigint;
  notes: string | null;
  version: number;
  createdBy: string;
  issuedAt: Date | null;
  voidedAt: Date | null;
  voidReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  lines: LineRow[];
}

function toLine(l: LineRow): SalesInvoiceLineSnapshot {
  return {
    ...l,
    priceSource: isPriceSource(l.priceSource) ? l.priceSource : 'MANUAL',
  };
}

function toInvoice(r: InvoiceRow): SalesInvoice {
  const s: SalesInvoiceSnapshot = {
    ...r,
    type: isInvoiceType(r.type) ? r.type : InvoiceType.Invoice,
    reason: r.reason && isNoteReason(r.reason) ? r.reason : null,
    status: isInvoiceStatus(r.status) ? r.status : InvoiceStatus.Void,
    invoiceDate: toIsoDate(r.invoiceDate),
    dueDate: toIsoDate(r.dueDate),
    lines: r.lines.map(toLine),
  };
  return SalesInvoice.fromSnapshot(s);
}

function invoiceData(s: SalesInvoiceSnapshot) {
  return {
    companyId: s.companyId,
    branchId: s.branchId,
    number: s.number,
    type: s.type,
    originalInvoiceId: s.originalInvoiceId,
    reason: s.reason,
    reasonText: s.reasonText,
    customerId: s.customerId,
    customerName: s.customerName,
    customerTaxId: s.customerTaxId,
    customerBranchNumber: s.customerBranchNumber,
    billingAddress: s.billingAddress,
    salesOrderId: s.salesOrderId,
    currency: s.currency,
    invoiceDate: fromIsoDate(s.invoiceDate),
    dueDate: fromIsoDate(s.dueDate),
    paymentTermsDays: s.paymentTermsDays,
    status: s.status,
    subtotalMinor: s.subtotalMinor,
    discountMinor: s.discountMinor,
    taxMinor: s.taxMinor,
    totalMinor: s.totalMinor,
    settledMinor: s.settledMinor,
    balanceMinor: s.balanceMinor,
    notes: s.notes,
    createdBy: s.createdBy,
    issuedAt: s.issuedAt,
    voidedAt: s.voidedAt,
    voidReason: s.voidReason,
  };
}

@Injectable()
export class PrismaSalesInvoiceRepository implements SalesInvoiceRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findById(tenantId: string, id: string) {
    const r = await this.txm
      .getClient()
      .salesInvoice.findFirst({ where: { tenantId, id }, include: withLines });
    return r ? toInvoice(r) : null;
  }

  async list(tenantId: string, f: InvoiceFilter) {
    const client = this.txm.getClient();
    const where = {
      tenantId,
      ...(f.status ? { status: f.status } : {}),
      ...(f.type ? { type: f.type } : {}),
      ...(f.customerId ? { customerId: f.customerId } : {}),
      ...(f.from || f.to
        ? {
            invoiceDate: {
              ...(f.from ? { gte: fromIsoDate(f.from) } : {}),
              ...(f.to ? { lte: fromIsoDate(f.to) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      client.salesInvoice.findMany({
        where,
        include: withLines,
        orderBy: { createdAt: 'desc' },
        skip: f.offset,
        take: f.limit,
      }),
      client.salesInvoice.count({ where }),
    ]);
    return { items: rows.map(toInvoice), total };
  }

  async listOpen(tenantId: string, customerId: string | null) {
    const rows = await this.txm.getClient().salesInvoice.findMany({
      where: {
        tenantId,
        type: InvoiceType.Invoice,
        status: { in: [...OPEN_STATUSES] },
        balanceMinor: { gt: 0n },
        ...(customerId ? { customerId } : {}),
      },
      include: withLines,
      orderBy: { dueDate: 'asc' },
    });
    return rows.map(toInvoice);
  }

  async invoicedQtyBySalesOrderLine(tenantId: string, salesOrderId: string) {
    const rows = await this.txm.getClient().salesInvoiceLine.groupBy({
      by: ['salesOrderLineId'],
      where: {
        tenantId,
        salesOrderLineId: { not: null },
        invoice: {
          salesOrderId,
          type: InvoiceType.Invoice,
          status: { not: InvoiceStatus.Void },
        },
      },
      _sum: { quantity: true },
    });
    const m = new Map<string, bigint>();
    for (const r of rows)
      if (r.salesOrderLineId) m.set(r.salesOrderLineId, r._sum.quantity ?? 0n);
    return m;
  }

  async listForStatement(
    tenantId: string,
    customerId: string,
    from: IsoDate,
    to: IsoDate,
  ) {
    const rows = await this.txm.getClient().salesInvoice.findMany({
      where: {
        tenantId,
        customerId,
        invoiceDate: { gte: fromIsoDate(from), lte: fromIsoDate(to) },
      },
      include: withLines,
      orderBy: { invoiceDate: 'asc' },
    });
    return rows.map(toInvoice);
  }

  async create(inv: SalesInvoice) {
    const s = inv.snapshot();
    await this.txm.getClient().salesInvoice.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        ...invoiceData(s),
        version: s.version,
        createdAt: s.createdAt,
        lines: { create: s.lines.map((l) => ({ ...l, tenantId: s.tenantId })) },
      },
    });
  }

  async save(inv: SalesInvoice) {
    const s = inv.snapshot();
    const client = this.txm.getClient();
    const r = await client.salesInvoice.updateMany({
      where: { tenantId: s.tenantId, id: s.id, version: s.version },
      data: { ...invoiceData(s), version: s.version + 1 },
    });
    if (r.count !== 1) {
      const actual = await client.salesInvoice.findFirst({
        where: { id: s.id },
        select: { version: true },
      });
      throw new ArVersionConflictError(s.id, s.version, actual?.version ?? -1);
    }
    await client.salesInvoiceLine.deleteMany({ where: { invoiceId: s.id } });
    if (s.lines.length > 0) {
      await client.salesInvoiceLine.createMany({
        data: s.lines.map((l) => ({
          ...l,
          tenantId: s.tenantId,
          invoiceId: s.id,
        })),
      });
    }
    return SalesInvoice.fromSnapshot({ ...s, version: s.version + 1 });
  }
}

const withAllocations = { allocations: true };

@Injectable()
export class PrismaReceiptRepository implements ReceiptRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  private toEntity(r: {
    id: string;
    tenantId: string;
    companyId: string;
    number: string;
    customerId: string;
    currency: string;
    receiptDate: Date;
    method: string;
    amountMinor: bigint;
    whtMinor: bigint;
    reference: string | null;
    chequeNumber: string | null;
    chequeBank: string | null;
    chequeDate: Date | null;
    notes: string | null;
    status: string;
    version: number;
    createdBy: string;
    postedAt: Date | null;
    voidedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    allocations: Array<{ id: string; invoiceId: string; amountMinor: bigint }>;
  }): Receipt {
    return Receipt.fromSnapshot({
      ...r,
      receiptDate: toIsoDate(r.receiptDate),
      chequeDate: r.chequeDate ? toIsoDate(r.chequeDate) : null,
      method: isReceiptMethod(r.method) ? r.method : ReceiptMethod.Cash,
      status: isReceiptStatus(r.status) ? r.status : ReceiptStatus.Void,
      allocations: r.allocations.map((a) => ({
        id: a.id,
        invoiceId: a.invoiceId,
        amountMinor: a.amountMinor,
      })),
    });
  }

  async findById(tenantId: string, id: string) {
    const r = await this.txm
      .getClient()
      .receipt.findFirst({ where: { tenantId, id }, include: withAllocations });
    return r ? this.toEntity(r) : null;
  }

  async list(tenantId: string, f: ReceiptFilter) {
    const client = this.txm.getClient();
    const where = {
      tenantId,
      ...(f.customerId ? { customerId: f.customerId } : {}),
      ...(f.status ? { status: f.status } : {}),
    };
    const [rows, total] = await Promise.all([
      client.receipt.findMany({
        where,
        include: withAllocations,
        orderBy: { createdAt: 'desc' },
        skip: f.offset,
        take: f.limit,
      }),
      client.receipt.count({ where }),
    ]);
    return { items: rows.map((r) => this.toEntity(r)), total };
  }

  async listForStatement(
    tenantId: string,
    customerId: string,
    from: IsoDate,
    to: IsoDate,
  ) {
    const rows = await this.txm.getClient().receipt.findMany({
      where: {
        tenantId,
        customerId,
        receiptDate: { gte: fromIsoDate(from), lte: fromIsoDate(to) },
      },
      include: withAllocations,
      orderBy: { receiptDate: 'asc' },
    });
    return rows.map((r) => this.toEntity(r));
  }

  async create(r: Receipt) {
    const s = r.snapshot();
    await this.txm.getClient().receipt.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        companyId: s.companyId,
        number: s.number,
        customerId: s.customerId,
        currency: s.currency,
        receiptDate: fromIsoDate(s.receiptDate),
        method: s.method,
        amountMinor: s.amountMinor,
        whtMinor: s.whtMinor,
        reference: s.reference,
        chequeNumber: s.chequeNumber,
        chequeBank: s.chequeBank,
        chequeDate: s.chequeDate ? fromIsoDate(s.chequeDate) : null,
        notes: s.notes,
        status: s.status,
        version: s.version,
        createdBy: s.createdBy,
        postedAt: s.postedAt,
        voidedAt: s.voidedAt,
        createdAt: s.createdAt,
        allocations: {
          create: s.allocations.map((a) => ({
            id: a.id,
            tenantId: s.tenantId,
            invoiceId: a.invoiceId,
            amountMinor: a.amountMinor,
          })),
        },
      },
    });
  }

  async save(r: Receipt) {
    const s = r.snapshot();
    const client = this.txm.getClient();
    const res = await client.receipt.updateMany({
      where: { tenantId: s.tenantId, id: s.id, version: s.version },
      data: {
        status: s.status,
        notes: s.notes,
        postedAt: s.postedAt,
        voidedAt: s.voidedAt,
        version: s.version + 1,
      },
    });
    if (res.count !== 1) {
      const actual = await client.receipt.findFirst({
        where: { id: s.id },
        select: { version: true },
      });
      throw new ArVersionConflictError(s.id, s.version, actual?.version ?? -1);
    }
    await client.receiptAllocation.deleteMany({ where: { receiptId: s.id } });
    if (s.allocations.length > 0) {
      await client.receiptAllocation.createMany({
        data: s.allocations.map((a) => ({
          id: a.id,
          tenantId: s.tenantId,
          receiptId: s.id,
          invoiceId: a.invoiceId,
          amountMinor: a.amountMinor,
        })),
      });
    }
    return Receipt.fromSnapshot({ ...s, version: s.version + 1 });
  }
}
