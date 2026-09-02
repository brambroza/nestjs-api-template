import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import { fromIsoDate, toIsoDate } from '../../../../shared/domain';
import {
  PurchaseRequisition,
  PurchaseVersionConflictError,
  RequisitionStatus,
  isRequisitionStatus,
  type RequisitionLineSnapshot,
  type RequisitionSnapshot,
} from '../domain';
import type {
  ListRequisitionsFilter,
  ListRequisitionsPage,
  RequisitionRepository,
} from '../application/ports/requisition.repository';

const withLines = { lines: { orderBy: { lineNo: 'asc' as const } } };

interface Row {
  id: string;
  tenantId: string;
  companyId: string;
  number: string;
  requesterId: string;
  neededByDate: Date | null;
  purpose: string | null;
  status: string;
  currency: string;
  estimatedTotalMinor: bigint;
  approvalRequestId: string | null;
  purchaseOrderId: string | null;
  version: number;
  createdBy: string;
  submittedAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lines: Array<{
    id: string;
    lineNo: number;
    itemId: string;
    itemSku: string;
    description: string;
    uomCode: string;
    quantity: bigint;
    estimatedUnitPriceMinor: bigint;
    estimatedTotalMinor: bigint;
    suggestedVendorId: string | null;
  }>;
}

function toSnapshot(r: Row): RequisitionSnapshot {
  return {
    id: r.id,
    tenantId: r.tenantId,
    companyId: r.companyId,
    number: r.number,
    requesterId: r.requesterId,
    neededByDate: r.neededByDate ? toIsoDate(r.neededByDate) : null,
    purpose: r.purpose,
    status: isRequisitionStatus(r.status)
      ? r.status
      : RequisitionStatus.Cancelled,
    currency: r.currency,
    estimatedTotalMinor: r.estimatedTotalMinor,
    approvalRequestId: r.approvalRequestId,
    purchaseOrderId: r.purchaseOrderId,
    version: r.version,
    createdBy: r.createdBy,
    submittedAt: r.submittedAt,
    resolvedAt: r.resolvedAt,
    lines: r.lines.map((l) => ({
      id: l.id,
      lineNo: l.lineNo,
      itemId: l.itemId,
      itemSku: l.itemSku,
      description: l.description,
      uomCode: l.uomCode,
      quantity: l.quantity,
      estimatedUnitPriceMinor: l.estimatedUnitPriceMinor,
      estimatedTotalMinor: l.estimatedTotalMinor,
      suggestedVendorId: l.suggestedVendorId,
    })),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function headerData(s: RequisitionSnapshot) {
  return {
    companyId: s.companyId,
    number: s.number,
    requesterId: s.requesterId,
    neededByDate: s.neededByDate ? fromIsoDate(s.neededByDate) : null,
    purpose: s.purpose,
    status: s.status,
    currency: s.currency,
    estimatedTotalMinor: s.estimatedTotalMinor,
    approvalRequestId: s.approvalRequestId,
    purchaseOrderId: s.purchaseOrderId,
    createdBy: s.createdBy,
    submittedAt: s.submittedAt,
    resolvedAt: s.resolvedAt,
  };
}

function lineData(
  tenantId: string,
  requisitionId: string,
  l: RequisitionLineSnapshot,
) {
  return {
    id: l.id,
    tenantId,
    requisitionId,
    lineNo: l.lineNo,
    itemId: l.itemId,
    itemSku: l.itemSku,
    description: l.description,
    uomCode: l.uomCode,
    quantity: l.quantity,
    estimatedUnitPriceMinor: l.estimatedUnitPriceMinor,
    estimatedTotalMinor: l.estimatedTotalMinor,
    suggestedVendorId: l.suggestedVendorId,
  };
}

@Injectable()
export class PrismaRequisitionRepository implements RequisitionRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findById(
    tenantId: string,
    id: string,
  ): Promise<PurchaseRequisition | null> {
    const row = await this.txm.getClient().purchaseRequisition.findFirst({
      where: { tenantId, id },
      include: withLines,
    });
    return row ? PurchaseRequisition.fromSnapshot(toSnapshot(row)) : null;
  }

  async list(
    tenantId: string,
    f: ListRequisitionsFilter,
  ): Promise<ListRequisitionsPage> {
    const client = this.txm.getClient();
    const where = {
      tenantId,
      ...(f.status ? { status: f.status } : {}),
      ...(f.requesterId ? { requesterId: f.requesterId } : {}),
    };
    const [rows, total] = await Promise.all([
      client.purchaseRequisition.findMany({
        where,
        include: withLines,
        orderBy: { createdAt: 'desc' },
        skip: f.offset,
        take: f.limit,
      }),
      client.purchaseRequisition.count({ where }),
    ]);
    return {
      items: rows.map((r) => PurchaseRequisition.fromSnapshot(toSnapshot(r))),
      total,
    };
  }

  async create(pr: PurchaseRequisition): Promise<void> {
    const s = pr.snapshot();
    await this.txm.getClient().purchaseRequisition.create({
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

  async save(pr: PurchaseRequisition): Promise<PurchaseRequisition> {
    const s = pr.snapshot();
    const client = this.txm.getClient();
    const result = await client.purchaseRequisition.updateMany({
      where: { tenantId: s.tenantId, id: s.id, version: s.version },
      data: { ...headerData(s), version: s.version + 1 },
    });
    if (result.count !== 1) {
      const actual = await client.purchaseRequisition.findFirst({
        where: { tenantId: s.tenantId, id: s.id },
        select: { version: true },
      });
      throw new PurchaseVersionConflictError(
        s.id,
        s.version,
        actual?.version ?? -1,
      );
    }
    await client.purchaseRequisitionLine.deleteMany({
      where: { requisitionId: s.id },
    });
    if (s.lines.length > 0) {
      await client.purchaseRequisitionLine.createMany({
        data: s.lines.map((l) => lineData(s.tenantId, s.id, l)),
      });
    }
    return PurchaseRequisition.fromSnapshot({ ...s, version: s.version + 1 });
  }
}
