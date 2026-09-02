import {
  Money,
  buildDocumentLines,
  computeDocumentTotals,
  isIsoDate,
  type DocumentLineInput,
  type DocumentLineSnapshot,
  type DocumentTotals,
  type IsoDate,
} from '../../../../shared/domain';
import { DomainError } from '../../../../shared/errors';

import {
  MAX_NOTES_LENGTH,
  MAX_PAYMENT_TERMS_DAYS,
  OverReceiptError,
  PurchaseApprovalPendingError,
  isInt,
  normaliseText,
  type ApprovalAnswer,
  type SubmitOutcome,
} from './errors';

export const PurchaseOrderStatus = {
  Draft: 'DRAFT',
  PendingApproval: 'PENDING_APPROVAL',
  Issued: 'ISSUED',
  PartiallyReceived: 'PARTIALLY_RECEIVED',
  Received: 'RECEIVED',
  Rejected: 'REJECTED',
  Cancelled: 'CANCELLED',
} as const;
export type PurchaseOrderStatus =
  (typeof PurchaseOrderStatus)[keyof typeof PurchaseOrderStatus];
export function isPurchaseOrderStatus(v: string): v is PurchaseOrderStatus {
  return (Object.values(PurchaseOrderStatus) as string[]).includes(v);
}

const TRANSITIONS: Readonly<
  Record<PurchaseOrderStatus, readonly PurchaseOrderStatus[]>
> = {
  DRAFT: ['PENDING_APPROVAL', 'ISSUED', 'CANCELLED'],
  PENDING_APPROVAL: ['ISSUED', 'REJECTED', 'DRAFT', 'CANCELLED'],
  ISSUED: ['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
  PARTIALLY_RECEIVED: ['RECEIVED'],
  RECEIVED: [],
  REJECTED: ['DRAFT'],
  CANCELLED: [],
};

export function canTransitionPurchaseOrder(
  from: PurchaseOrderStatus,
  to: PurchaseOrderStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export class PurchaseOrderNotFoundError extends DomainError {
  readonly code = 'PURCHASE.ORDER_NOT_FOUND';
  constructor(readonly purchaseOrderId: string) {
    super(`Purchase order ${purchaseOrderId} not found`);
  }
}

export class IllegalPurchaseOrderTransitionError extends DomainError {
  readonly code = 'PURCHASE.ILLEGAL_ORDER_TRANSITION';
  constructor(
    readonly purchaseOrderId: string,
    readonly from: PurchaseOrderStatus,
    readonly to: PurchaseOrderStatus,
  ) {
    super(`Purchase order ${purchaseOrderId}: ${from} -> ${to} is not allowed`);
  }
}

export class PurchaseOrderNotEditableError extends DomainError {
  readonly code = 'PURCHASE.ORDER_NOT_EDITABLE';
  constructor(
    readonly purchaseOrderId: string,
    readonly status: PurchaseOrderStatus,
  ) {
    super(
      `Purchase order ${purchaseOrderId} is ${status}; only DRAFT can be edited`,
    );
  }
}

export class InvalidPurchaseOrderError extends DomainError {
  readonly code = 'PURCHASE.INVALID_ORDER';
}

export class PurchaseOrderHasReceiptsError extends DomainError {
  readonly code = 'PURCHASE.ORDER_HAS_RECEIPTS';
  constructor(readonly purchaseOrderId: string) {
    super(
      `Purchase order ${purchaseOrderId} already has receipts and cannot be cancelled`,
    );
  }
}

export type PurchaseOrderLineInput = DocumentLineInput;
export interface PurchaseOrderLineSnapshot extends DocumentLineSnapshot {
  readonly receivedQty: bigint;
}
export type PurchaseOrderTotals = DocumentTotals;

export interface ReceiptPosting {
  readonly purchaseOrderLineId: string;
  readonly quantity: bigint;
}

export interface PurchaseOrderSnapshot extends PurchaseOrderTotals {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly number: string;
  readonly requisitionId: string | null;
  readonly vendorId: string;
  readonly currency: string;
  readonly orderDate: IsoDate;
  readonly expectedDate: IsoDate | null;
  readonly status: PurchaseOrderStatus;
  readonly paymentTermsDays: number;
  readonly notes: string | null;
  readonly approvalRequestId: string | null;
  readonly version: number;
  readonly createdBy: string;
  readonly submittedAt: Date | null;
  readonly issuedAt: Date | null;
  readonly resolvedAt: Date | null;
  readonly cancelReason: string | null;
  readonly lines: readonly PurchaseOrderLineSnapshot[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreatePurchaseOrderProps {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly number: string;
  readonly requisitionId?: string | null;
  readonly vendorId: string;
  readonly currency: string;
  readonly orderDate: IsoDate;
  readonly expectedDate?: IsoDate | null;
  readonly paymentTermsDays: number;
  readonly notes?: string | null;
  readonly createdBy: string;
  readonly lines: readonly PurchaseOrderLineInput[];
  readonly now: Date;
}

export interface PurchaseOrderHeaderPatch {
  readonly expectedDate?: IsoDate | null;
  readonly paymentTermsDays?: number;
  readonly notes?: string | null;
}

function validateHeader(args: {
  orderDate: IsoDate;
  expectedDate: IsoDate | null;
  paymentTermsDays: number;
  notes: string | null;
}): void {
  if (!isIsoDate(args.orderDate)) {
    throw new InvalidPurchaseOrderError('orderDate must be YYYY-MM-DD');
  }
  if (args.expectedDate !== null) {
    if (!isIsoDate(args.expectedDate)) {
      throw new InvalidPurchaseOrderError('expectedDate must be YYYY-MM-DD');
    }
    if (args.expectedDate < args.orderDate) {
      throw new InvalidPurchaseOrderError(
        'expectedDate must be on or after orderDate',
      );
    }
  }
  if (
    !isInt(args.paymentTermsDays) ||
    args.paymentTermsDays < 0 ||
    args.paymentTermsDays > MAX_PAYMENT_TERMS_DAYS
  ) {
    throw new InvalidPurchaseOrderError(
      `paymentTermsDays must be an integer 0..${String(MAX_PAYMENT_TERMS_DAYS)}`,
    );
  }
  if (args.notes !== null && args.notes.length > MAX_NOTES_LENGTH) {
    throw new InvalidPurchaseOrderError(
      `notes must be <= ${String(MAX_NOTES_LENGTH)} characters`,
    );
  }
}

function withReceived(
  lines: readonly DocumentLineSnapshot[],
  received: ReadonlyMap<string, bigint> = new Map(),
): PurchaseOrderLineSnapshot[] {
  return lines.map((l) => ({ ...l, receivedQty: received.get(l.id) ?? 0n }));
}

/**
 * Purchase order (T-221/T-222). DRAFT → PENDING_APPROVAL | ISSUED (auto)
 * → PARTIALLY_RECEIVED → RECEIVED; REJECTED → DRAFT; cancel before any
 * receipt. Receipts are posted by the goods-receipt flow and never
 * exceed the ordered quantity.
 */
export class PurchaseOrder {
  private constructor(private readonly s: PurchaseOrderSnapshot) {}

  static create(props: CreatePurchaseOrderProps): PurchaseOrder {
    const currency = Money.zero(props.currency).currency;
    const notes = normaliseText(props.notes);
    const expectedDate = props.expectedDate ?? null;
    validateHeader({
      orderDate: props.orderDate,
      expectedDate,
      paymentTermsDays: props.paymentTermsDays,
      notes,
    });
    if (props.number.trim().length === 0)
      throw new InvalidPurchaseOrderError('number is required');
    const lines = withReceived(buildDocumentLines(props.lines, currency));
    return new PurchaseOrder({
      id: props.id,
      tenantId: props.tenantId,
      companyId: props.companyId,
      number: props.number.trim(),
      requisitionId: props.requisitionId ?? null,
      vendorId: props.vendorId,
      currency,
      orderDate: props.orderDate,
      expectedDate,
      status: PurchaseOrderStatus.Draft,
      paymentTermsDays: props.paymentTermsDays,
      notes,
      ...computeDocumentTotals(lines, currency),
      approvalRequestId: null,
      version: 0,
      createdBy: props.createdBy,
      submittedAt: null,
      issuedAt: null,
      resolvedAt: null,
      cancelReason: null,
      lines,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: PurchaseOrderSnapshot): PurchaseOrder {
    return new PurchaseOrder(s);
  }

  snapshot(): PurchaseOrderSnapshot {
    return this.s;
  }
  get id(): string {
    return this.s.id;
  }
  get status(): PurchaseOrderStatus {
    return this.s.status;
  }
  get version(): number {
    return this.s.version;
  }
  get hasReceipts(): boolean {
    return this.s.lines.some((l) => l.receivedQty > 0n);
  }

  remainingQty(purchaseOrderLineId: string): bigint | null {
    const l = this.s.lines.find((x) => x.id === purchaseOrderLineId);
    return l ? l.quantity - l.receivedQty : null;
  }

  private assertEditable(): void {
    if (this.s.status !== PurchaseOrderStatus.Draft) {
      throw new PurchaseOrderNotEditableError(this.s.id, this.s.status);
    }
  }

  private transition(
    to: PurchaseOrderStatus,
    now: Date,
    patch: Partial<PurchaseOrderSnapshot> = {},
  ): PurchaseOrder {
    if (!canTransitionPurchaseOrder(this.s.status, to)) {
      throw new IllegalPurchaseOrderTransitionError(
        this.s.id,
        this.s.status,
        to,
      );
    }
    return new PurchaseOrder({
      ...this.s,
      ...patch,
      status: to,
      updatedAt: now,
    });
  }

  updateHeader(patch: PurchaseOrderHeaderPatch, now: Date): PurchaseOrder {
    this.assertEditable();
    const next = {
      orderDate: this.s.orderDate,
      expectedDate:
        patch.expectedDate === undefined
          ? this.s.expectedDate
          : patch.expectedDate,
      paymentTermsDays: patch.paymentTermsDays ?? this.s.paymentTermsDays,
      notes:
        patch.notes === undefined ? this.s.notes : normaliseText(patch.notes),
    };
    validateHeader(next);
    return new PurchaseOrder({ ...this.s, ...next, updatedAt: now });
  }

  replaceLines(
    inputs: readonly PurchaseOrderLineInput[],
    now: Date,
  ): PurchaseOrder {
    this.assertEditable();
    const lines = withReceived(buildDocumentLines(inputs, this.s.currency));
    return new PurchaseOrder({
      ...this.s,
      lines,
      ...computeDocumentTotals(lines, this.s.currency),
      updatedAt: now,
    });
  }

  submit(outcome: SubmitOutcome, now: Date): PurchaseOrder {
    if (this.s.lines.length === 0) {
      throw new InvalidPurchaseOrderError(
        'a purchase order needs at least one line to be submitted',
      );
    }
    const patch = {
      approvalRequestId: outcome.approvalRequestId,
      submittedAt: now,
    };
    return outcome.approval === 'APPROVED'
      ? this.transition(PurchaseOrderStatus.Issued, now, {
          ...patch,
          issuedAt: now,
        })
      : this.transition(PurchaseOrderStatus.PendingApproval, now, patch);
  }

  applyApprovalOutcome(answer: ApprovalAnswer, now: Date): PurchaseOrder {
    if (this.s.status !== PurchaseOrderStatus.PendingApproval) {
      throw new IllegalPurchaseOrderTransitionError(
        this.s.id,
        this.s.status,
        PurchaseOrderStatus.Issued,
      );
    }
    switch (answer) {
      case 'APPROVED':
        return this.transition(PurchaseOrderStatus.Issued, now, {
          issuedAt: now,
        });
      case 'REJECTED':
        return this.transition(PurchaseOrderStatus.Rejected, now, {
          resolvedAt: now,
        });
      case 'CANCELLED':
      case 'NONE':
        return this.transition(PurchaseOrderStatus.Draft, now, {
          approvalRequestId: null,
          submittedAt: null,
        });
      case 'PENDING':
        throw new PurchaseApprovalPendingError(
          this.s.id,
          this.s.approvalRequestId,
        );
    }
  }

  reopen(now: Date): PurchaseOrder {
    return this.transition(PurchaseOrderStatus.Draft, now, {
      approvalRequestId: null,
      submittedAt: null,
      resolvedAt: null,
    });
  }

  cancel(reason: string | null, now: Date): PurchaseOrder {
    const r = (reason ?? '').trim();
    if (r.length > 500)
      throw new InvalidPurchaseOrderError('reason must be <= 500 characters');
    if (this.hasReceipts) throw new PurchaseOrderHasReceiptsError(this.s.id);
    return this.transition(PurchaseOrderStatus.Cancelled, now, {
      resolvedAt: now,
      cancelReason: r.length === 0 ? null : r,
    });
  }

  recordReceipt(postings: readonly ReceiptPosting[], now: Date): PurchaseOrder {
    if (
      this.s.status !== PurchaseOrderStatus.Issued &&
      this.s.status !== PurchaseOrderStatus.PartiallyReceived
    ) {
      throw new IllegalPurchaseOrderTransitionError(
        this.s.id,
        this.s.status,
        PurchaseOrderStatus.PartiallyReceived,
      );
    }
    if (postings.length === 0)
      throw new InvalidPurchaseOrderError('a receipt needs at least one line');
    const received = new Map(this.s.lines.map((l) => [l.id, l.receivedQty]));
    for (const p of postings) {
      const line = this.s.lines.find((l) => l.id === p.purchaseOrderLineId);
      if (!line) {
        throw new InvalidPurchaseOrderError(
          `line ${p.purchaseOrderLineId} does not belong to this order`,
        );
      }
      if (p.quantity <= 0n) {
        throw new InvalidPurchaseOrderError(
          `line ${p.purchaseOrderLineId}: quantity must be > 0`,
        );
      }
      const already = received.get(line.id) ?? 0n;
      const remaining = line.quantity - already;
      if (p.quantity > remaining)
        throw new OverReceiptError(line.id, remaining, p.quantity);
      received.set(line.id, already + p.quantity);
    }
    const lines = this.s.lines.map((l) => ({
      ...l,
      receivedQty: received.get(l.id) ?? l.receivedQty,
    }));
    const complete = lines.every((l) => l.receivedQty >= l.quantity);
    const to = complete
      ? PurchaseOrderStatus.Received
      : PurchaseOrderStatus.PartiallyReceived;
    const patch = { lines, ...(complete ? { resolvedAt: now } : {}) };
    return to === this.s.status
      ? new PurchaseOrder({ ...this.s, ...patch, updatedAt: now })
      : this.transition(to, now, patch);
  }
}
