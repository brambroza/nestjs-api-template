import { isIsoDate, type IsoDate } from '../../../../shared/domain';
import { DomainError } from '../../../../shared/errors';

import { normaliseText } from './errors';

export const GoodsReceiptStatus = {
  Draft: 'DRAFT',
  Posted: 'POSTED',
  Cancelled: 'CANCELLED',
} as const;
export type GoodsReceiptStatus =
  (typeof GoodsReceiptStatus)[keyof typeof GoodsReceiptStatus];
export function isGoodsReceiptStatus(v: string): v is GoodsReceiptStatus {
  return (Object.values(GoodsReceiptStatus) as string[]).includes(v);
}

export class GoodsReceiptNotFoundError extends DomainError {
  readonly code = 'PURCHASE.GOODS_RECEIPT_NOT_FOUND';
  constructor(readonly goodsReceiptId: string) {
    super(`Goods receipt ${goodsReceiptId} not found`);
  }
}

export class IllegalGoodsReceiptTransitionError extends DomainError {
  readonly code = 'PURCHASE.ILLEGAL_GOODS_RECEIPT_TRANSITION';
  constructor(
    readonly goodsReceiptId: string,
    readonly from: GoodsReceiptStatus,
    readonly to: GoodsReceiptStatus,
  ) {
    super(`Goods receipt ${goodsReceiptId}: ${from} -> ${to} is not allowed`);
  }
}

export class InvalidGoodsReceiptError extends DomainError {
  readonly code = 'PURCHASE.INVALID_GOODS_RECEIPT';
}

export interface GoodsReceiptLineInput {
  readonly id: string;
  readonly purchaseOrderLineId: string;
  readonly itemId: string;
  readonly itemSku: string;
  readonly uomCode: string;
  readonly quantity: bigint;
  readonly lotNumber: string | null;
  readonly expiryDate: IsoDate | null;
}

export interface GoodsReceiptLineSnapshot extends GoodsReceiptLineInput {
  readonly lineNo: number;
}

export interface GoodsReceiptSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly purchaseOrderId: string;
  readonly number: string;
  readonly status: GoodsReceiptStatus;
  readonly receiptDate: IsoDate;
  readonly warehouseId: string;
  readonly vendorDeliveryRef: string | null;
  readonly notes: string | null;
  readonly version: number;
  readonly createdBy: string;
  readonly postedAt: Date | null;
  readonly lines: readonly GoodsReceiptLineSnapshot[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateGoodsReceiptProps {
  readonly id: string;
  readonly tenantId: string;
  readonly purchaseOrderId: string;
  readonly number: string;
  readonly receiptDate: IsoDate;
  readonly warehouseId: string;
  readonly vendorDeliveryRef?: string | null;
  readonly notes?: string | null;
  readonly createdBy: string;
  readonly lines: readonly GoodsReceiptLineInput[];
  readonly now: Date;
}

const MAX_LOT = 64;
const MAX_REF = 64;
const MAX_NOTES = 2000;

/**
 * Goods receipt note (T-223, capture only). DRAFT → POSTED posts the
 * received quantities onto the purchase order in the same transaction
 * and records lot / expiry for LOT-tracked items so Phase C inventory
 * can turn the receipt into stock movements. Posted notes are immutable.
 */
export class GoodsReceipt {
  private constructor(private readonly s: GoodsReceiptSnapshot) {}

  static create(props: CreateGoodsReceiptProps): GoodsReceipt {
    if (!isIsoDate(props.receiptDate)) {
      throw new InvalidGoodsReceiptError('receiptDate must be YYYY-MM-DD');
    }
    if (props.warehouseId.trim().length === 0) {
      throw new InvalidGoodsReceiptError('warehouseId is required');
    }
    if (props.lines.length === 0) {
      throw new InvalidGoodsReceiptError(
        'a goods receipt needs at least one line',
      );
    }
    const ref = normaliseText(props.vendorDeliveryRef);
    if (ref !== null && ref.length > MAX_REF) {
      throw new InvalidGoodsReceiptError(
        `vendorDeliveryRef must be <= ${String(MAX_REF)} characters`,
      );
    }
    const notes = normaliseText(props.notes);
    if (notes !== null && notes.length > MAX_NOTES) {
      throw new InvalidGoodsReceiptError(
        `notes must be <= ${String(MAX_NOTES)} characters`,
      );
    }
    const seen = new Set<string>();
    const lines = props.lines.map((l, i) => {
      const at = `line ${String(i + 1)}`;
      if (l.quantity <= 0n)
        throw new InvalidGoodsReceiptError(`${at}: quantity must be > 0`);
      if (seen.has(l.purchaseOrderLineId)) {
        throw new InvalidGoodsReceiptError(
          `order line ${l.purchaseOrderLineId} appears more than once`,
        );
      }
      seen.add(l.purchaseOrderLineId);
      const lotNumber = normaliseText(l.lotNumber);
      if (lotNumber !== null && lotNumber.length > MAX_LOT) {
        throw new InvalidGoodsReceiptError(
          `${at}: lotNumber must be <= ${String(MAX_LOT)} characters`,
        );
      }
      if (l.expiryDate !== null && !isIsoDate(l.expiryDate)) {
        throw new InvalidGoodsReceiptError(
          `${at}: expiryDate must be YYYY-MM-DD`,
        );
      }
      return { ...l, lotNumber, lineNo: i + 1 };
    });
    return new GoodsReceipt({
      id: props.id,
      tenantId: props.tenantId,
      purchaseOrderId: props.purchaseOrderId,
      number: props.number,
      status: GoodsReceiptStatus.Draft,
      receiptDate: props.receiptDate,
      warehouseId: props.warehouseId.trim(),
      vendorDeliveryRef: ref,
      notes,
      version: 0,
      createdBy: props.createdBy,
      postedAt: null,
      lines,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: GoodsReceiptSnapshot): GoodsReceipt {
    return new GoodsReceipt(s);
  }

  snapshot(): GoodsReceiptSnapshot {
    return this.s;
  }
  get id(): string {
    return this.s.id;
  }
  get status(): GoodsReceiptStatus {
    return this.s.status;
  }
  get version(): number {
    return this.s.version;
  }

  private transition(
    to: GoodsReceiptStatus,
    now: Date,
    patch: Partial<GoodsReceiptSnapshot> = {},
  ): GoodsReceipt {
    if (this.s.status !== GoodsReceiptStatus.Draft) {
      throw new IllegalGoodsReceiptTransitionError(
        this.s.id,
        this.s.status,
        to,
      );
    }
    return new GoodsReceipt({
      ...this.s,
      ...patch,
      status: to,
      updatedAt: now,
    });
  }

  post(now: Date): GoodsReceipt {
    return this.transition(GoodsReceiptStatus.Posted, now, { postedAt: now });
  }

  cancel(now: Date): GoodsReceipt {
    return this.transition(GoodsReceiptStatus.Cancelled, now);
  }
}
