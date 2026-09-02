import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import { fromIsoDate, toIsoDate } from '../../../../shared/domain';
import {
  Quotation,
  QuotationStatus,
  QuotationVersionConflictError,
  isPriceSource,
  isQuotationStatus,
  type QuotationLineSnapshot,
  type QuotationSnapshot,
} from '../domain';
import type {
  ListQuotationsFilter,
  ListQuotationsPage,
  QuotationRepository,
} from '../application/ports/quotation.repository';

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
}

interface HeaderRow {
  id: string;
  tenantId: string;
  companyId: string;
  number: string;
  revision: number;
  customerId: string;
  currency: string;
  quoteDate: Date;
  validUntil: Date;
  status: string;
  paymentTermsDays: number;
  notes: string | null;
  subtotalMinor: bigint;
  discountMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  version: number;
  createdBy: string;
  sentAt: Date | null;
  resolvedAt: Date | null;
  rejectReason: string | null;
  salesOrderId: string | null;
  createdAt: Date;
  updatedAt: Date;
  lines: LineRow[];
}

function toLine(r: LineRow): QuotationLineSnapshot {
  return {
    id: r.id,
    lineNo: r.lineNo,
    itemId: r.itemId,
    itemSku: r.itemSku,
    description: r.description,
    uomCode: r.uomCode,
    quantity: r.quantity,
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

function toSnapshot(r: HeaderRow): QuotationSnapshot {
  return {
    id: r.id,
    tenantId: r.tenantId,
    companyId: r.companyId,
    number: r.number,
    revision: r.revision,
    customerId: r.customerId,
    currency: r.currency,
    quoteDate: toIsoDate(r.quoteDate),
    validUntil: toIsoDate(r.validUntil),
    status: isQuotationStatus(r.status) ? r.status : QuotationStatus.Cancelled,
    paymentTermsDays: r.paymentTermsDays,
    notes: r.notes,
    subtotalMinor: r.subtotalMinor,
    discountMinor: r.discountMinor,
    taxMinor: r.taxMinor,
    totalMinor: r.totalMinor,
    version: r.version,
    createdBy: r.createdBy,
    sentAt: r.sentAt,
    resolvedAt: r.resolvedAt,
    rejectReason: r.rejectReason,
    salesOrderId: r.salesOrderId,
    lines: r.lines.map(toLine),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function headerData(s: QuotationSnapshot) {
  return {
    companyId: s.companyId,
    number: s.number,
    revision: s.revision,
    customerId: s.customerId,
    currency: s.currency,
    quoteDate: fromIsoDate(s.quoteDate),
    validUntil: fromIsoDate(s.validUntil),
    status: s.status,
    paymentTermsDays: s.paymentTermsDays,
    notes: s.notes,
    subtotalMinor: s.subtotalMinor,
    discountMinor: s.discountMinor,
    taxMinor: s.taxMinor,
    totalMinor: s.totalMinor,
    createdBy: s.createdBy,
    sentAt: s.sentAt,
    resolvedAt: s.resolvedAt,
    rejectReason: s.rejectReason,
    salesOrderId: s.salesOrderId,
  };
}

function lineData(
  tenantId: string,
  quotationId: string,
  l: QuotationLineSnapshot,
) {
  return {
    id: l.id,
    tenantId,
    quotationId,
    lineNo: l.lineNo,
    itemId: l.itemId,
    itemSku: l.itemSku,
    description: l.description,
    uomCode: l.uomCode,
    quantity: l.quantity,
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
export class PrismaQuotationRepository implements QuotationRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findById(tenantId: string, id: string): Promise<Quotation | null> {
    const row = await this.txm.getClient().quotation.findFirst({
      where: { tenantId, id },
      include: withLines,
    });
    return row ? Quotation.fromSnapshot(toSnapshot(row)) : null;
  }

  async findRevisions(
    tenantId: string,
    number: string,
  ): Promise<readonly Quotation[]> {
    const rows = await this.txm.getClient().quotation.findMany({
      where: { tenantId, number },
      include: withLines,
      orderBy: { revision: 'desc' },
    });
    return rows.map((r) => Quotation.fromSnapshot(toSnapshot(r)));
  }

  async list(
    tenantId: string,
    f: ListQuotationsFilter,
  ): Promise<ListQuotationsPage> {
    const client = this.txm.getClient();
    const where = {
      tenantId,
      ...(f.status ? { status: f.status } : {}),
      ...(f.customerId ? { customerId: f.customerId } : {}),
    };
    const [rows, total] = await Promise.all([
      client.quotation.findMany({
        where,
        include: withLines,
        orderBy: [{ createdAt: 'desc' }, { revision: 'desc' }],
        skip: f.offset,
        take: f.limit,
      }),
      client.quotation.count({ where }),
    ]);
    return {
      items: rows.map((r) => Quotation.fromSnapshot(toSnapshot(r))),
      total,
    };
  }

  async create(q: Quotation): Promise<void> {
    const s = q.snapshot();
    await this.txm.getClient().quotation.create({
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

  async save(q: Quotation): Promise<Quotation> {
    const s = q.snapshot();
    const client = this.txm.getClient();
    const result = await client.quotation.updateMany({
      where: { tenantId: s.tenantId, id: s.id, version: s.version },
      data: { ...headerData(s), version: s.version + 1 },
    });
    if (result.count !== 1) {
      const actual = await client.quotation.findFirst({
        where: { tenantId: s.tenantId, id: s.id },
        select: { version: true },
      });
      throw new QuotationVersionConflictError(
        s.id,
        s.version,
        actual?.version ?? -1,
      );
    }
    await client.quotationLine.deleteMany({ where: { quotationId: s.id } });
    if (s.lines.length > 0) {
      await client.quotationLine.createMany({
        data: s.lines.map((l) => lineData(s.tenantId, s.id, l)),
      });
    }
    return Quotation.fromSnapshot({ ...s, version: s.version + 1 });
  }

  async listDueForExpiry(
    onDate: string,
    limit: number,
  ): Promise<readonly Quotation[]> {
    const rows = await this.txm.getClient().quotation.findMany({
      where: {
        status: QuotationStatus.Sent,
        validUntil: { lt: fromIsoDate(onDate) },
      },
      include: withLines,
      orderBy: { validUntil: 'asc' },
      take: limit,
    });
    return rows.map((r) => Quotation.fromSnapshot(toSnapshot(r)));
  }
}
