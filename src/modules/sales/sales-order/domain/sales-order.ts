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

// ---- status --------------------------------------------------------------

export const SalesOrderStatus = {
  Draft: 'DRAFT',
  PendingApproval: 'PENDING_APPROVAL',
  Confirmed: 'CONFIRMED',
  PartiallyDelivered: 'PARTIALLY_DELIVERED',
  Delivered: 'DELIVERED',
  Rejected: 'REJECTED',
  Cancelled: 'CANCELLED',
} as const;
export type SalesOrderStatus =
  (typeof SalesOrderStatus)[keyof typeof SalesOrderStatus];
export function isSalesOrderStatus(v: string): v is SalesOrderStatus {
  return (Object.values(SalesOrderStatus) as string[]).includes(v);
}

/** Statuses whose amounts count against the customer's credit limit. */
export const OPEN_EXPOSURE_STATUSES: readonly SalesOrderStatus[] = [
  'PENDING_APPROVAL',
  'CONFIRMED',
  'PARTIALLY_DELIVERED',
  'DELIVERED',
];

export const CreditStatus = {
  NotChecked: 'NOT_CHECKED',
  NoLimit: 'NO_LIMIT',
  Ok: 'OK',
  Exceeded: 'EXCEEDED',
} as const;
export type CreditStatus = (typeof CreditStatus)[keyof typeof CreditStatus];
export function isCreditStatus(v: string): v is CreditStatus {
  return (Object.values(CreditStatus) as string[]).includes(v);
}

const TRANSITIONS: Readonly<
  Record<SalesOrderStatus, readonly SalesOrderStatus[]>
> = {
  DRAFT: ['PENDING_APPROVAL', 'CONFIRMED', 'CANCELLED'],
  PENDING_APPROVAL: ['CONFIRMED', 'REJECTED', 'DRAFT', 'CANCELLED'],
  CONFIRMED: ['PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED'],
  PARTIALLY_DELIVERED: ['DELIVERED'],
  DELIVERED: [],
  REJECTED: ['DRAFT'],
  CANCELLED: [],
};

export function canTransition(
  from: SalesOrderStatus,
  to: SalesOrderStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

// ---- errors ----------------------------------------------------------------

export class SalesOrderNotFoundError extends DomainError {
  readonly code = 'SALES.ORDER_NOT_FOUND';
  constructor(readonly salesOrderId: string) {
    super(`Sales order ${salesOrderId} not found`);
  }
}

export class IllegalSalesOrderTransitionError extends DomainError {
  readonly code = 'SALES.ILLEGAL_ORDER_TRANSITION';
  constructor(
    readonly salesOrderId: string,
    readonly from: SalesOrderStatus,
    readonly to: SalesOrderStatus,
  ) {
    super(`Sales order ${salesOrderId}: ${from} -> ${to} is not allowed`);
  }
}

export class SalesOrderNotEditableError extends DomainError {
  readonly code = 'SALES.ORDER_NOT_EDITABLE';
  constructor(
    readonly salesOrderId: string,
    readonly status: SalesOrderStatus,
  ) {
    super(`Sales order ${salesOrderId} is ${status}; only DRAFT can be edited`);
  }
}

export class InvalidSalesOrderError extends DomainError {
  readonly code = 'SALES.INVALID_ORDER';
}

export class SalesOrderVersionConflictError extends DomainError {
  readonly code = 'SALES.VERSION_CONFLICT';
  constructor(
    readonly salesOrderId: string,
    readonly expectedVersion: number,
    readonly actualVersion: number,
  ) {
    super(
      `Sales order ${salesOrderId} was modified concurrently (expected v${String(expectedVersion)}, found v${String(actualVersion)})`,
    );
  }
}

export class CreditLimitExceededError extends DomainError {
  readonly code = 'SALES.CREDIT_LIMIT_EXCEEDED';
  constructor(
    readonly customerId: string,
    readonly exposureMinor: bigint,
    readonly creditLimitMinor: bigint,
  ) {
    super(
      `Customer ${customerId}: exposure ${exposureMinor.toString()} exceeds credit limit ${creditLimitMinor.toString()} and no approval policy covers it`,
    );
  }
}

export class ApprovalPendingError extends DomainError {
  readonly code = 'SALES.APPROVAL_PENDING';
  constructor(
    readonly salesOrderId: string,
    readonly approvalRequestId: string | null,
  ) {
    super(`Sales order ${salesOrderId} is still waiting for approval`);
  }
}

export class OverDeliveryError extends DomainError {
  readonly code = 'SALES.OVER_DELIVERY';
  constructor(
    readonly salesOrderLineId: string,
    readonly remaining: bigint,
    readonly requested: bigint,
  ) {
    super(
      `Line ${salesOrderLineId}: ${requested.toString()} requested but only ${remaining.toString()} remains undelivered`,
    );
  }
}

export class QuotationNotConvertibleError extends DomainError {
  readonly code = 'SALES.QUOTATION_NOT_CONVERTIBLE';
}

export interface SalesStockShortage {
  readonly itemId: string;
  readonly itemSku: string;
  readonly uomCode: string;
  readonly requiredQty: bigint;
  readonly availableQty: bigint;
}

/** T-213: confirm reserves stock; a shortage blocks the confirmation. */
export class SalesStockShortageError extends DomainError {
  readonly code = 'SALES.STOCK_SHORTAGE';
  constructor(
    readonly salesOrderId: string,
    readonly warehouseId: string,
    readonly shortages: readonly SalesStockShortage[],
  ) {
    super(
      `Sales order ${salesOrderId}: insufficient stock in ${warehouseId} for ${shortages
        .map(
          (s) =>
            `${s.itemSku} (${s.availableQty.toString()}/${s.requiredQty.toString()} ${s.uomCode})`,
        )
        .join(', ')}`,
    );
  }
}

export class SalesOrderHasDeliveriesError extends DomainError {
  readonly code = 'SALES.ORDER_HAS_DELIVERIES';
  constructor(readonly salesOrderId: string) {
    super(
      `Sales order ${salesOrderId} already has deliveries and cannot be cancelled`,
    );
  }
}

// ---- lines -----------------------------------------------------------------

export type SalesOrderLineInput = DocumentLineInput;

export interface SalesOrderLineSnapshot extends DocumentLineSnapshot {
  readonly deliveredQty: bigint;
}

export type SalesOrderTotals = DocumentTotals;

export interface DeliveryPosting {
  readonly salesOrderLineId: string;
  readonly quantity: bigint;
}

function isInt(v: number): boolean {
  return Number.isInteger(v);
}

// ---- aggregate -------------------------------------------------------------

export interface SalesOrderSnapshot extends SalesOrderTotals {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly number: string;
  readonly quotationId: string | null;
  readonly customerId: string;
  readonly currency: string;
  readonly orderDate: IsoDate;
  readonly requestedDeliveryDate: IsoDate | null;
  readonly status: SalesOrderStatus;
  readonly paymentTermsDays: number;
  readonly notes: string | null;
  readonly creditStatus: CreditStatus;
  readonly creditExposureMinor: bigint;
  readonly approvalRequestId: string | null;
  readonly version: number;
  readonly createdBy: string;
  readonly submittedAt: Date | null;
  readonly confirmedAt: Date | null;
  readonly resolvedAt: Date | null;
  readonly cancelReason: string | null;
  readonly lines: readonly SalesOrderLineSnapshot[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateSalesOrderProps {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly number: string;
  readonly quotationId?: string | null;
  readonly customerId: string;
  readonly currency: string;
  readonly orderDate: IsoDate;
  readonly requestedDeliveryDate?: IsoDate | null;
  readonly paymentTermsDays: number;
  readonly notes?: string | null;
  readonly createdBy: string;
  readonly lines: readonly SalesOrderLineInput[];
  readonly now: Date;
}

export interface SalesOrderHeaderPatch {
  readonly requestedDeliveryDate?: IsoDate | null;
  readonly paymentTermsDays?: number;
  readonly notes?: string | null;
}

export interface CreditCheck {
  readonly status: CreditStatus;
  readonly exposureMinor: bigint;
}

export interface SubmitOutcome {
  readonly approvalRequestId: string;
  /** APPROVED = no step applied (auto), PENDING = approvers must act. */
  readonly approval: 'APPROVED' | 'PENDING';
}

export const MAX_PAYMENT_TERMS_DAYS = 365;
export const MAX_NOTES_LENGTH = 2000;

function validateHeader(args: {
  orderDate: IsoDate;
  requestedDeliveryDate: IsoDate | null;
  paymentTermsDays: number;
  notes: string | null;
}): void {
  if (!isIsoDate(args.orderDate)) {
    throw new InvalidSalesOrderError('orderDate must be YYYY-MM-DD');
  }
  if (args.requestedDeliveryDate !== null) {
    if (!isIsoDate(args.requestedDeliveryDate)) {
      throw new InvalidSalesOrderError(
        'requestedDeliveryDate must be YYYY-MM-DD',
      );
    }
    if (args.requestedDeliveryDate < args.orderDate) {
      throw new InvalidSalesOrderError(
        'requestedDeliveryDate must be on or after orderDate',
      );
    }
  }
  if (
    !isInt(args.paymentTermsDays) ||
    args.paymentTermsDays < 0 ||
    args.paymentTermsDays > MAX_PAYMENT_TERMS_DAYS
  ) {
    throw new InvalidSalesOrderError(
      `paymentTermsDays must be an integer 0..${String(MAX_PAYMENT_TERMS_DAYS)}`,
    );
  }
  if (args.notes !== null && args.notes.length > MAX_NOTES_LENGTH) {
    throw new InvalidSalesOrderError(
      `notes must be <= ${String(MAX_NOTES_LENGTH)} characters`,
    );
  }
}

function normaliseNotes(notes: string | null | undefined): string | null {
  const t = (notes ?? '').trim();
  return t.length === 0 ? null : t;
}

function withDelivered(
  lines: readonly DocumentLineSnapshot[],
  delivered: ReadonlyMap<string, bigint> = new Map(),
): SalesOrderLineSnapshot[] {
  return lines.map((l) => ({ ...l, deliveredQty: delivered.get(l.id) ?? 0n }));
}

/**
 * Sales order (EPIC-B.2). Lifecycle
 *   DRAFT → PENDING_APPROVAL → CONFIRMED → PARTIALLY_DELIVERED → DELIVERED
 *   DRAFT → CONFIRMED (auto-approved), PENDING_APPROVAL → REJECTED → DRAFT
 *   DRAFT | PENDING_APPROVAL | CONFIRMED (no deliveries) → CANCELLED
 * Credit exposure and the approval request id are stamped at submit.
 * Delivery quantities are posted by the delivery-note flow and can
 * never exceed the ordered quantity (T-214). Stock reservation
 * (T-213) is Phase C.
 */
export class SalesOrder {
  private constructor(private readonly s: SalesOrderSnapshot) {}

  static create(props: CreateSalesOrderProps): SalesOrder {
    const currency = Money.zero(props.currency).currency;
    const notes = normaliseNotes(props.notes);
    const requestedDeliveryDate = props.requestedDeliveryDate ?? null;
    validateHeader({
      orderDate: props.orderDate,
      requestedDeliveryDate,
      paymentTermsDays: props.paymentTermsDays,
      notes,
    });
    if (props.number.trim().length === 0) {
      throw new InvalidSalesOrderError('number is required');
    }
    const lines = withDelivered(buildDocumentLines(props.lines, currency));
    return new SalesOrder({
      id: props.id,
      tenantId: props.tenantId,
      companyId: props.companyId,
      number: props.number.trim(),
      quotationId: props.quotationId ?? null,
      customerId: props.customerId,
      currency,
      orderDate: props.orderDate,
      requestedDeliveryDate,
      status: SalesOrderStatus.Draft,
      paymentTermsDays: props.paymentTermsDays,
      notes,
      ...computeDocumentTotals(lines, currency),
      creditStatus: CreditStatus.NotChecked,
      creditExposureMinor: 0n,
      approvalRequestId: null,
      version: 0,
      createdBy: props.createdBy,
      submittedAt: null,
      confirmedAt: null,
      resolvedAt: null,
      cancelReason: null,
      lines,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: SalesOrderSnapshot): SalesOrder {
    return new SalesOrder(s);
  }

  snapshot(): SalesOrderSnapshot {
    return this.s;
  }
  get id(): string {
    return this.s.id;
  }
  get status(): SalesOrderStatus {
    return this.s.status;
  }
  get version(): number {
    return this.s.version;
  }

  get hasDeliveries(): boolean {
    return this.s.lines.some((l) => l.deliveredQty > 0n);
  }

  remainingQty(salesOrderLineId: string): bigint | null {
    const l = this.s.lines.find((x) => x.id === salesOrderLineId);
    return l ? l.quantity - l.deliveredQty : null;
  }

  private assertEditable(): void {
    if (this.s.status !== SalesOrderStatus.Draft) {
      throw new SalesOrderNotEditableError(this.s.id, this.s.status);
    }
  }

  private transition(
    to: SalesOrderStatus,
    now: Date,
    patch: Partial<SalesOrderSnapshot> = {},
  ): SalesOrder {
    if (!canTransition(this.s.status, to)) {
      throw new IllegalSalesOrderTransitionError(this.s.id, this.s.status, to);
    }
    return new SalesOrder({ ...this.s, ...patch, status: to, updatedAt: now });
  }

  updateHeader(patch: SalesOrderHeaderPatch, now: Date): SalesOrder {
    this.assertEditable();
    const next = {
      orderDate: this.s.orderDate,
      requestedDeliveryDate:
        patch.requestedDeliveryDate === undefined
          ? this.s.requestedDeliveryDate
          : patch.requestedDeliveryDate,
      paymentTermsDays: patch.paymentTermsDays ?? this.s.paymentTermsDays,
      notes:
        patch.notes === undefined ? this.s.notes : normaliseNotes(patch.notes),
    };
    validateHeader(next);
    return new SalesOrder({ ...this.s, ...next, updatedAt: now });
  }

  replaceLines(inputs: readonly SalesOrderLineInput[], now: Date): SalesOrder {
    this.assertEditable();
    const lines = withDelivered(buildDocumentLines(inputs, this.s.currency));
    return new SalesOrder({
      ...this.s,
      lines,
      ...computeDocumentTotals(lines, this.s.currency),
      updatedAt: now,
    });
  }

  /**
   * DRAFT → CONFIRMED when the approval framework answered APPROVED at
   * once (no policy / below every threshold), otherwise PENDING_APPROVAL.
   * A credit breach is only acceptable when a human will look at it.
   */
  submit(args: {
    readonly credit: CreditCheck;
    readonly outcome: SubmitOutcome;
    readonly creditLimitMinor: bigint;
    readonly now: Date;
  }): SalesOrder {
    if (this.s.lines.length === 0) {
      throw new InvalidSalesOrderError(
        'a sales order needs at least one line to be submitted',
      );
    }
    if (
      args.credit.status === CreditStatus.Exceeded &&
      args.outcome.approval === 'APPROVED'
    ) {
      throw new CreditLimitExceededError(
        this.s.customerId,
        args.credit.exposureMinor,
        args.creditLimitMinor,
      );
    }
    const patch = {
      creditStatus: args.credit.status,
      creditExposureMinor: args.credit.exposureMinor,
      approvalRequestId: args.outcome.approvalRequestId,
      submittedAt: args.now,
    };
    return args.outcome.approval === 'APPROVED'
      ? this.transition(SalesOrderStatus.Confirmed, args.now, {
          ...patch,
          confirmedAt: args.now,
        })
      : this.transition(SalesOrderStatus.PendingApproval, args.now, patch);
  }

  /** Pull model: the order asks the approval framework and applies the answer. */
  applyApprovalOutcome(
    outcome: 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'PENDING' | 'NONE',
    now: Date,
  ): SalesOrder {
    if (this.s.status !== SalesOrderStatus.PendingApproval) {
      throw new IllegalSalesOrderTransitionError(
        this.s.id,
        this.s.status,
        SalesOrderStatus.Confirmed,
      );
    }
    switch (outcome) {
      case 'APPROVED':
        return this.transition(SalesOrderStatus.Confirmed, now, {
          confirmedAt: now,
        });
      case 'REJECTED':
        return this.transition(SalesOrderStatus.Rejected, now, {
          resolvedAt: now,
        });
      case 'CANCELLED':
      case 'NONE':
        return this.transition(SalesOrderStatus.Draft, now, {
          approvalRequestId: null,
          submittedAt: null,
        });
      case 'PENDING':
        throw new ApprovalPendingError(this.s.id, this.s.approvalRequestId);
    }
  }

  reopen(now: Date): SalesOrder {
    return this.transition(SalesOrderStatus.Draft, now, {
      approvalRequestId: null,
      submittedAt: null,
      resolvedAt: null,
      creditStatus: CreditStatus.NotChecked,
      creditExposureMinor: 0n,
    });
  }

  cancel(reason: string | null, now: Date): SalesOrder {
    const r = (reason ?? '').trim();
    if (r.length > 500) {
      throw new InvalidSalesOrderError('reason must be <= 500 characters');
    }
    if (this.hasDeliveries) throw new SalesOrderHasDeliveriesError(this.s.id);
    return this.transition(SalesOrderStatus.Cancelled, now, {
      resolvedAt: now,
      cancelReason: r.length === 0 ? null : r,
    });
  }

  /** Posts shipped quantities; never over-delivers; derives the status. */
  recordDelivery(postings: readonly DeliveryPosting[], now: Date): SalesOrder {
    if (
      this.s.status !== SalesOrderStatus.Confirmed &&
      this.s.status !== SalesOrderStatus.PartiallyDelivered
    ) {
      throw new IllegalSalesOrderTransitionError(
        this.s.id,
        this.s.status,
        SalesOrderStatus.PartiallyDelivered,
      );
    }
    if (postings.length === 0) {
      throw new InvalidSalesOrderError('a delivery needs at least one line');
    }
    const delivered = new Map(this.s.lines.map((l) => [l.id, l.deliveredQty]));
    for (const p of postings) {
      const line = this.s.lines.find((l) => l.id === p.salesOrderLineId);
      if (!line) {
        throw new InvalidSalesOrderError(
          `line ${p.salesOrderLineId} does not belong to this order`,
        );
      }
      if (p.quantity <= 0n) {
        throw new InvalidSalesOrderError(
          `line ${p.salesOrderLineId}: quantity must be > 0`,
        );
      }
      const already = delivered.get(line.id) ?? 0n;
      const remaining = line.quantity - already;
      if (p.quantity > remaining) {
        throw new OverDeliveryError(line.id, remaining, p.quantity);
      }
      delivered.set(line.id, already + p.quantity);
    }
    const lines = this.s.lines.map((l) => ({
      ...l,
      deliveredQty: delivered.get(l.id) ?? l.deliveredQty,
    }));
    const complete = lines.every((l) => l.deliveredQty >= l.quantity);
    const to = complete
      ? SalesOrderStatus.Delivered
      : SalesOrderStatus.PartiallyDelivered;
    const patch = { lines, ...(complete ? { resolvedAt: now } : {}) };
    return to === this.s.status
      ? new SalesOrder({ ...this.s, ...patch, updatedAt: now })
      : this.transition(to, now, patch);
  }
}
