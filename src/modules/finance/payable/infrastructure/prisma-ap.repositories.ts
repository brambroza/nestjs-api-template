import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import {
  fromIsoDate,
  isPriceSource,
  toIsoDate,
  type IsoDate,
} from '../../../../shared/domain';
import {
  AP_OPEN_STATUSES,
  ApVersionConflictError,
  BatchStatus,
  MatchStatus,
  PaymentBatch,
  PaymentMethod,
  PaymentVoucher,
  VendorInvoice,
  VendorInvoiceStatus,
  VoucherStatus,
  isBatchStatus,
  isMatchStatus,
  isPaymentMethod,
  isVendorInvoiceStatus,
  isVoucherStatus,
  type VendorInvoiceLineSnapshot,
  type VendorInvoiceSnapshot,
  type WhtCertificateSnapshot,
} from '../domain';
import type {
  PaymentBatchRepository,
  PaymentVoucherRepository,
  VendorInvoiceFilter,
  VendorInvoiceRepository,
  VoucherFilter,
  WhtCertificateRepository,
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
  purchaseOrderLineId: string | null;
  whtTaxCodeId: string | null;
  whtTaxCode: string | null;
  whtRateBp: number;
  whtPndForm: string | null;
  whtIncomeType: string | null;
}
interface InvoiceRow {
  id: string;
  tenantId: string;
  companyId: string;
  number: string;
  vendorInvoiceNumber: string;
  vendorId: string;
  vendorName: string;
  vendorTaxId: string | null;
  purchaseOrderId: string | null;
  currency: string;
  invoiceDate: Date;
  dueDate: Date;
  paymentTermsDays: number;
  status: string;
  matchStatus: string;
  matchIssues: string | null;
  subtotalMinor: bigint;
  discountMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  settledMinor: bigint;
  balanceMinor: bigint;
  notes: string | null;
  version: number;
  createdBy: string;
  postedAt: Date | null;
  voidedAt: Date | null;
  voidReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  lines: LineRow[];
}

function toInvoice(r: InvoiceRow): VendorInvoice {
  const s: VendorInvoiceSnapshot = {
    ...r,
    status: isVendorInvoiceStatus(r.status)
      ? r.status
      : VendorInvoiceStatus.Void,
    matchStatus: isMatchStatus(r.matchStatus)
      ? r.matchStatus
      : MatchStatus.Unmatched,
    matchIssues: r.matchIssues ? (JSON.parse(r.matchIssues) as string[]) : [],
    invoiceDate: toIsoDate(r.invoiceDate),
    dueDate: toIsoDate(r.dueDate),
    lines: r.lines.map((l): VendorInvoiceLineSnapshot => ({
      ...l,
      priceSource: isPriceSource(l.priceSource) ? l.priceSource : 'MANUAL',
    })),
  };
  return VendorInvoice.fromSnapshot(s);
}

function invoiceData(s: VendorInvoiceSnapshot) {
  return {
    companyId: s.companyId,
    number: s.number,
    vendorInvoiceNumber: s.vendorInvoiceNumber,
    vendorId: s.vendorId,
    vendorName: s.vendorName,
    vendorTaxId: s.vendorTaxId,
    purchaseOrderId: s.purchaseOrderId,
    currency: s.currency,
    invoiceDate: fromIsoDate(s.invoiceDate),
    dueDate: fromIsoDate(s.dueDate),
    paymentTermsDays: s.paymentTermsDays,
    status: s.status,
    matchStatus: s.matchStatus,
    matchIssues: s.matchIssues.length ? JSON.stringify(s.matchIssues) : null,
    subtotalMinor: s.subtotalMinor,
    discountMinor: s.discountMinor,
    taxMinor: s.taxMinor,
    totalMinor: s.totalMinor,
    settledMinor: s.settledMinor,
    balanceMinor: s.balanceMinor,
    notes: s.notes,
    createdBy: s.createdBy,
    postedAt: s.postedAt,
    voidedAt: s.voidedAt,
    voidReason: s.voidReason,
  };
}

@Injectable()
export class PrismaVendorInvoiceRepository implements VendorInvoiceRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findById(tenantId: string, id: string) {
    const r = await this.txm
      .getClient()
      .vendorInvoice.findFirst({ where: { tenantId, id }, include: withLines });
    return r ? toInvoice(r) : null;
  }
  async list(tenantId: string, f: VendorInvoiceFilter) {
    const client = this.txm.getClient();
    const where = {
      tenantId,
      ...(f.status ? { status: f.status } : {}),
      ...(f.vendorId ? { vendorId: f.vendorId } : {}),
    };
    const [rows, total] = await Promise.all([
      client.vendorInvoice.findMany({
        where,
        include: withLines,
        orderBy: { createdAt: 'desc' },
        skip: f.offset,
        take: f.limit,
      }),
      client.vendorInvoice.count({ where }),
    ]);
    return { items: rows.map(toInvoice), total };
  }
  async listOpen(
    tenantId: string,
    vendorId: string | null,
    dueOnOrBefore: IsoDate | null,
  ) {
    const rows = await this.txm.getClient().vendorInvoice.findMany({
      where: {
        tenantId,
        status: { in: [...AP_OPEN_STATUSES] },
        balanceMinor: { gt: 0n },
        ...(vendorId ? { vendorId } : {}),
        ...(dueOnOrBefore
          ? { dueDate: { lte: fromIsoDate(dueOnOrBefore) } }
          : {}),
      },
      include: withLines,
      orderBy: { dueDate: 'asc' },
    });
    return rows.map(toInvoice);
  }
  async invoicedQtyByPurchaseOrderLine(
    tenantId: string,
    purchaseOrderId: string,
  ) {
    const rows = await this.txm.getClient().vendorInvoiceLine.groupBy({
      by: ['purchaseOrderLineId'],
      where: {
        tenantId,
        purchaseOrderLineId: { not: null },
        invoice: { purchaseOrderId, status: { not: VendorInvoiceStatus.Void } },
      },
      _sum: { quantity: true },
    });
    const m = new Map<string, bigint>();
    for (const r of rows)
      if (r.purchaseOrderLineId)
        m.set(r.purchaseOrderLineId, r._sum.quantity ?? 0n);
    return m;
  }
  async create(inv: VendorInvoice) {
    const s = inv.snapshot();
    await this.txm.getClient().vendorInvoice.create({
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
  async save(inv: VendorInvoice) {
    const s = inv.snapshot();
    const client = this.txm.getClient();
    const r = await client.vendorInvoice.updateMany({
      where: { tenantId: s.tenantId, id: s.id, version: s.version },
      data: { ...invoiceData(s), version: s.version + 1 },
    });
    if (r.count !== 1) {
      const actual = await client.vendorInvoice.findFirst({
        where: { id: s.id },
        select: { version: true },
      });
      throw new ApVersionConflictError(s.id, s.version, actual?.version ?? -1);
    }
    return VendorInvoice.fromSnapshot({ ...s, version: s.version + 1 });
  }
}

const withAllocations = { allocations: true };

@Injectable()
export class PrismaPaymentVoucherRepository implements PaymentVoucherRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  private toEntity(r: {
    id: string;
    tenantId: string;
    companyId: string;
    number: string;
    vendorId: string;
    batchId: string | null;
    currency: string;
    paymentDate: Date;
    method: string;
    grossMinor: bigint;
    whtMinor: bigint;
    netPaidMinor: bigint;
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
    allocations: Array<{
      id: string;
      invoiceId: string;
      amountMinor: bigint;
      whtMinor: bigint;
    }>;
  }): PaymentVoucher {
    return PaymentVoucher.fromSnapshot({
      ...r,
      paymentDate: toIsoDate(r.paymentDate),
      chequeDate: r.chequeDate ? toIsoDate(r.chequeDate) : null,
      method: isPaymentMethod(r.method) ? r.method : PaymentMethod.Cash,
      status: isVoucherStatus(r.status) ? r.status : VoucherStatus.Void,
      allocations: r.allocations.map((a) => ({
        id: a.id,
        invoiceId: a.invoiceId,
        amountMinor: a.amountMinor,
        whtMinor: a.whtMinor,
      })),
    });
  }
  async findById(tenantId: string, id: string) {
    const r = await this.txm.getClient().paymentVoucher.findFirst({
      where: { tenantId, id },
      include: withAllocations,
    });
    return r ? this.toEntity(r) : null;
  }
  async findMany(tenantId: string, ids: readonly string[]) {
    if (ids.length === 0) return [];
    const rows = await this.txm.getClient().paymentVoucher.findMany({
      where: { tenantId, id: { in: [...ids] } },
      include: withAllocations,
    });
    return rows.map((r) => this.toEntity(r));
  }
  async listForBatch(tenantId: string, batchId: string) {
    const rows = await this.txm.getClient().paymentVoucher.findMany({
      where: { tenantId, batchId },
      include: withAllocations,
      orderBy: { number: 'asc' },
    });
    return rows.map((r) => this.toEntity(r));
  }
  async list(tenantId: string, f: VoucherFilter) {
    const client = this.txm.getClient();
    const where = {
      tenantId,
      ...(f.status ? { status: f.status } : {}),
      ...(f.vendorId ? { vendorId: f.vendorId } : {}),
      ...(f.batchId ? { batchId: f.batchId } : {}),
    };
    const [rows, total] = await Promise.all([
      client.paymentVoucher.findMany({
        where,
        include: withAllocations,
        orderBy: { createdAt: 'desc' },
        skip: f.offset,
        take: f.limit,
      }),
      client.paymentVoucher.count({ where }),
    ]);
    return { items: rows.map((r) => this.toEntity(r)), total };
  }
  async create(v: PaymentVoucher) {
    const s = v.snapshot();
    await this.txm.getClient().paymentVoucher.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        companyId: s.companyId,
        number: s.number,
        vendorId: s.vendorId,
        batchId: s.batchId,
        currency: s.currency,
        paymentDate: fromIsoDate(s.paymentDate),
        method: s.method,
        grossMinor: s.grossMinor,
        whtMinor: s.whtMinor,
        netPaidMinor: s.netPaidMinor,
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
            whtMinor: a.whtMinor,
          })),
        },
      },
    });
  }
  async save(v: PaymentVoucher) {
    const s = v.snapshot();
    const client = this.txm.getClient();
    const r = await client.paymentVoucher.updateMany({
      where: { tenantId: s.tenantId, id: s.id, version: s.version },
      data: {
        batchId: s.batchId,
        status: s.status,
        notes: s.notes,
        postedAt: s.postedAt,
        voidedAt: s.voidedAt,
        version: s.version + 1,
      },
    });
    if (r.count !== 1) {
      const actual = await client.paymentVoucher.findFirst({
        where: { id: s.id },
        select: { version: true },
      });
      throw new ApVersionConflictError(s.id, s.version, actual?.version ?? -1);
    }
    return PaymentVoucher.fromSnapshot({ ...s, version: s.version + 1 });
  }
}

@Injectable()
export class PrismaPaymentBatchRepository implements PaymentBatchRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}
  private toEntity(r: {
    id: string;
    tenantId: string;
    companyId: string;
    number: string;
    paymentDate: Date;
    method: string;
    currency: string;
    status: string;
    voucherCount: number;
    totalNetMinor: bigint;
    totalWhtMinor: bigint;
    version: number;
    createdBy: string;
    postedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): PaymentBatch {
    return PaymentBatch.fromSnapshot({
      ...r,
      paymentDate: toIsoDate(r.paymentDate),
      method: isPaymentMethod(r.method) ? r.method : PaymentMethod.Transfer,
      status: isBatchStatus(r.status) ? r.status : BatchStatus.Void,
    });
  }
  async findById(tenantId: string, id: string) {
    const r = await this.txm
      .getClient()
      .paymentBatch.findFirst({ where: { tenantId, id } });
    return r ? this.toEntity(r) : null;
  }
  async list(
    tenantId: string,
    f: { status?: string | null; limit: number; offset: number },
  ) {
    const client = this.txm.getClient();
    const where = { tenantId, ...(f.status ? { status: f.status } : {}) };
    const [rows, total] = await Promise.all([
      client.paymentBatch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: f.offset,
        take: f.limit,
      }),
      client.paymentBatch.count({ where }),
    ]);
    return { items: rows.map((r) => this.toEntity(r)), total };
  }
  async create(b: PaymentBatch) {
    const s = b.snapshot();
    await this.txm.getClient().paymentBatch.create({
      data: { ...s, paymentDate: fromIsoDate(s.paymentDate) },
    });
  }
  async save(b: PaymentBatch) {
    const s = b.snapshot();
    const client = this.txm.getClient();
    const r = await client.paymentBatch.updateMany({
      where: { tenantId: s.tenantId, id: s.id, version: s.version },
      data: { status: s.status, postedAt: s.postedAt, version: s.version + 1 },
    });
    if (r.count !== 1) {
      const actual = await client.paymentBatch.findFirst({
        where: { id: s.id },
        select: { version: true },
      });
      throw new ApVersionConflictError(s.id, s.version, actual?.version ?? -1);
    }
    return PaymentBatch.fromSnapshot({ ...s, version: s.version + 1 });
  }
}

const withCertLines = { lines: { orderBy: { lineNo: 'asc' as const } } };

@Injectable()
export class PrismaWhtCertificateRepository implements WhtCertificateRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}
  private toSnapshot(r: {
    id: string;
    tenantId: string;
    companyId: string;
    voucherId: string;
    number: string;
    pndForm: string;
    vendorId: string;
    vendorName: string;
    vendorTaxId: string | null;
    paymentDate: Date;
    totalBaseMinor: bigint;
    totalTaxMinor: bigint;
    isVoid: boolean;
    createdAt: Date;
    lines: Array<{
      id: string;
      lineNo: number;
      taxCode: string;
      incomeType: string;
      rateBp: number;
      baseMinor: bigint;
      taxMinor: bigint;
    }>;
  }): WhtCertificateSnapshot {
    return { ...r, paymentDate: toIsoDate(r.paymentDate) };
  }
  async findById(tenantId: string, id: string) {
    const r = await this.txm.getClient().whtCertificate.findFirst({
      where: { tenantId, id },
      include: withCertLines,
    });
    return r ? this.toSnapshot(r) : null;
  }
  async findByVoucher(tenantId: string, voucherId: string) {
    const r = await this.txm.getClient().whtCertificate.findFirst({
      where: { tenantId, voucherId },
      include: withCertLines,
    });
    return r ? this.toSnapshot(r) : null;
  }
  async list(
    tenantId: string,
    f: {
      vendorId?: string | null;
      from?: IsoDate | null;
      to?: IsoDate | null;
      limit: number;
      offset: number;
    },
  ) {
    const client = this.txm.getClient();
    const where = {
      tenantId,
      ...(f.vendorId ? { vendorId: f.vendorId } : {}),
      ...(f.from || f.to
        ? {
            paymentDate: {
              ...(f.from ? { gte: fromIsoDate(f.from) } : {}),
              ...(f.to ? { lte: fromIsoDate(f.to) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      client.whtCertificate.findMany({
        where,
        include: withCertLines,
        orderBy: { paymentDate: 'desc' },
        skip: f.offset,
        take: f.limit,
      }),
      client.whtCertificate.count({ where }),
    ]);
    return { items: rows.map((r) => this.toSnapshot(r)), total };
  }
  async create(c: WhtCertificateSnapshot) {
    await this.txm.getClient().whtCertificate.create({
      data: {
        id: c.id,
        tenantId: c.tenantId,
        companyId: c.companyId,
        voucherId: c.voucherId,
        number: c.number,
        pndForm: c.pndForm,
        vendorId: c.vendorId,
        vendorName: c.vendorName,
        vendorTaxId: c.vendorTaxId,
        paymentDate: fromIsoDate(c.paymentDate),
        totalBaseMinor: c.totalBaseMinor,
        totalTaxMinor: c.totalTaxMinor,
        isVoid: c.isVoid,
        createdAt: c.createdAt,
        lines: { create: c.lines.map((l) => ({ ...l, tenantId: c.tenantId })) },
      },
    });
  }
  async markVoid(tenantId: string, id: string) {
    await this.txm.getClient().whtCertificate.updateMany({
      where: { tenantId, id },
      data: { isVoid: true },
    });
  }
}
