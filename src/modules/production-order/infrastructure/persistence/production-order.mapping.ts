import type { ProductionOrder as PrismaProductionOrder } from '@prisma/client';

import {
  Money,
  OrderId,
  ProductionOrder,
  ProductionOrderStatus,
  Quantity,
  TenantId,
  UserId,
  type ProductionOrderSnapshot,
} from '../../domain';

const STATUS_VALUES = new Set<string>(Object.values(ProductionOrderStatus));

function toStatus(raw: string): ProductionOrderStatus {
  if (!STATUS_VALUES.has(raw)) {
    throw new Error(`Unknown production order status in DB: ${raw}`);
  }
  return raw as ProductionOrderStatus;
}

const CURRENCY_VALUES = new Set(['THB', 'USD', 'JPY']);

function toCurrency(raw: string): 'THB' | 'USD' | 'JPY' {
  if (!CURRENCY_VALUES.has(raw)) {
    throw new Error(`Unknown currency in DB: ${raw}`);
  }
  return raw as 'THB' | 'USD' | 'JPY';
}

/**
 * Rehydrates a domain aggregate from a Prisma row (plus the sibling
 * ProgressReport rows). Data-only mapping — no domain logic, no
 * side effects.
 */
export function toDomain(
  row: PrismaProductionOrder,
  progressReports: readonly {
    quantityValue: bigint;
    quantityUom: string;
    reportedBy: string;
    reportedAt: Date;
  }[],
): ProductionOrder {
  const snapshot: ProductionOrderSnapshot = {
    id: OrderId.of(row.id),
    tenantId: TenantId.of(row.tenantId),
    createdBy: UserId.of(row.createdBy),
    status: toStatus(row.status),
    orderedQuantity: Quantity.of(
      row.orderedQuantityValue,
      row.orderedQuantityUom,
    ),
    totalAmount: Money.of(
      row.totalAmountSatang,
      toCurrency(row.totalAmountCurrency),
    ),
    firstApprover: row.firstApprover ? UserId.of(row.firstApprover) : null,
    secondApprover: row.secondApprover ? UserId.of(row.secondApprover) : null,
    producedQuantity: Quantity.of(
      row.producedQuantityValue,
      row.producedQuantityUom,
    ),
    progressReports: progressReports.map((r) => ({
      quantity: Quantity.of(r.quantityValue, r.quantityUom),
      by: UserId.of(r.reportedBy),
      at: r.reportedAt,
    })),
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  return ProductionOrder.fromSnapshot(snapshot);
}

/** Extract fields for a write path, without touching version — the repo
 * decides the new version so the optimistic-lock check stays there. */
export function fromDomain(order: ProductionOrder): {
  data: Omit<PrismaProductionOrder, 'version'>;
  newProgress: readonly {
    quantityValue: bigint;
    quantityUom: string;
    reportedBy: string;
    reportedAt: Date;
  }[];
} {
  const snap = order.snapshot();
  return {
    data: {
      id: snap.id,
      tenantId: snap.tenantId,
      createdBy: snap.createdBy,
      status: snap.status,
      orderedQuantityValue: snap.orderedQuantity.value,
      orderedQuantityUom: snap.orderedQuantity.uom,
      totalAmountSatang: snap.totalAmount.amount,
      totalAmountCurrency: snap.totalAmount.currency,
      firstApprover: snap.firstApprover ?? null,
      secondApprover: snap.secondApprover ?? null,
      producedQuantityValue: snap.producedQuantity.value,
      producedQuantityUom: snap.producedQuantity.uom,
      createdAt: snap.createdAt,
      updatedAt: snap.updatedAt,
    },
    newProgress: snap.progressReports.map((r) => ({
      quantityValue: r.quantity.value,
      quantityUom: r.quantity.uom,
      reportedBy: r.by,
      reportedAt: r.at,
    })),
  };
}
