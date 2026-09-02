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

/**
 * Fields for a fresh INSERT (includes createdBy + createdAt — set once,
 * immutable thereafter). The repo picks the initial version.
 */
export function insertShape(order: ProductionOrder): {
  data: Omit<PrismaProductionOrder, 'version'>;
  newProgress: readonly ProgressRow[];
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
    newProgress: progressRows(snap.progressReports),
  };
}

/**
 * Fields safe to overwrite on UPDATE. Deliberately excludes id,
 * tenantId, createdBy, createdAt — those are immutable after INSERT.
 * If a future aggregate change accidentally mutated createdBy, the DB
 * would previously overwrite silently; now the field simply isn't
 * present in the update payload.
 */
export function updateShape(order: ProductionOrder): {
  data: Omit<
    PrismaProductionOrder,
    'id' | 'tenantId' | 'createdBy' | 'createdAt' | 'version'
  >;
  newProgress: readonly ProgressRow[];
} {
  const snap = order.snapshot();
  return {
    data: {
      status: snap.status,
      orderedQuantityValue: snap.orderedQuantity.value,
      orderedQuantityUom: snap.orderedQuantity.uom,
      totalAmountSatang: snap.totalAmount.amount,
      totalAmountCurrency: snap.totalAmount.currency,
      firstApprover: snap.firstApprover ?? null,
      secondApprover: snap.secondApprover ?? null,
      producedQuantityValue: snap.producedQuantity.value,
      producedQuantityUom: snap.producedQuantity.uom,
      updatedAt: snap.updatedAt,
    },
    newProgress: progressRows(snap.progressReports),
  };
}

interface ProgressRow {
  readonly quantityValue: bigint;
  readonly quantityUom: string;
  readonly reportedBy: string;
  readonly reportedAt: Date;
}

function progressRows(
  reports: ProductionOrderSnapshot['progressReports'],
): readonly ProgressRow[] {
  return reports.map((r) => ({
    quantityValue: r.quantity.value,
    quantityUom: r.quantity.uom,
    reportedBy: r.by,
    reportedAt: r.at,
  }));
}
