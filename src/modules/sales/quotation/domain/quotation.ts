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

export const QuotationStatus = {
  Draft: 'DRAFT',
  Sent: 'SENT',
  Accepted: 'ACCEPTED',
  Rejected: 'REJECTED',
  Expired: 'EXPIRED',
  Cancelled: 'CANCELLED',
} as const;
export type QuotationStatus =
  (typeof QuotationStatus)[keyof typeof QuotationStatus];
export function isQuotationStatus(v: string): v is QuotationStatus {
  return (Object.values(QuotationStatus) as string[]).includes(v);
}

/**
 * Transition table (docs/state-machine.md, "Quotation"). Rows = from,
 * values = allowed targets. Anything else is IllegalQuotationTransitionError.
 */
const TRANSITIONS: Readonly<
  Record<QuotationStatus, readonly QuotationStatus[]>
> = {
  DRAFT: ['SENT', 'CANCELLED'],
  SENT: ['ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export function canTransition(
  from: QuotationStatus,
  to: QuotationStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Statuses from which a new revision may be cut. */
export const REVISABLE_STATUSES: readonly QuotationStatus[] = [
  'SENT',
  'REJECTED',
  'EXPIRED',
];

// ---- errors ----------------------------------------------------------------

export class QuotationNotFoundError extends DomainError {
  readonly code = 'SALES.QUOTATION_NOT_FOUND';
  constructor(readonly quotationId: string) {
    super(`Quotation ${quotationId} not found`);
  }
}

export class IllegalQuotationTransitionError extends DomainError {
  readonly code = 'SALES.ILLEGAL_QUOTATION_TRANSITION';
  constructor(
    readonly quotationId: string,
    readonly from: QuotationStatus,
    readonly to: QuotationStatus,
  ) {
    super(`Quotation ${quotationId}: ${from} -> ${to} is not allowed`);
  }
}

export class QuotationNotEditableError extends DomainError {
  readonly code = 'SALES.QUOTATION_NOT_EDITABLE';
  constructor(
    readonly quotationId: string,
    readonly status: QuotationStatus,
  ) {
    super(`Quotation ${quotationId} is ${status}; only DRAFT can be edited`);
  }
}

export class QuotationExpiredError extends DomainError {
  readonly code = 'SALES.QUOTATION_EXPIRED';
  constructor(
    readonly quotationId: string,
    readonly validUntil: IsoDate,
  ) {
    super(`Quotation ${quotationId} expired on ${validUntil}`);
  }
}

export class InvalidQuotationError extends DomainError {
  readonly code = 'SALES.INVALID_QUOTATION';
}

export class QuotationVersionConflictError extends DomainError {
  readonly code = 'SALES.VERSION_CONFLICT';
  constructor(
    readonly quotationId: string,
    readonly expectedVersion: number,
    readonly actualVersion: number,
  ) {
    super(
      `Quotation ${quotationId} was modified concurrently (expected v${String(expectedVersion)}, found v${String(actualVersion)})`,
    );
  }
}

// ---- lines -----------------------------------------------------------------

/** Line shapes are the shared document-line kernel (src/shared/domain/document-line.ts). */
export type QuotationLineInput = DocumentLineInput;
export type QuotationLineSnapshot = DocumentLineSnapshot;
export type QuotationTotals = DocumentTotals;

function isInt(v: number): boolean {
  return Number.isInteger(v);
}

// ---- aggregate -------------------------------------------------------------

export interface QuotationSnapshot extends QuotationTotals {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly number: string;
  readonly revision: number;
  readonly customerId: string;
  readonly currency: string;
  readonly quoteDate: IsoDate;
  readonly validUntil: IsoDate;
  readonly status: QuotationStatus;
  readonly paymentTermsDays: number;
  readonly notes: string | null;
  readonly version: number;
  readonly createdBy: string;
  readonly sentAt: Date | null;
  readonly resolvedAt: Date | null;
  readonly rejectReason: string | null;
  readonly salesOrderId: string | null;
  readonly lines: readonly QuotationLineSnapshot[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateQuotationProps {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly number: string;
  readonly revision?: number;
  readonly customerId: string;
  readonly currency: string;
  readonly quoteDate: IsoDate;
  readonly validUntil: IsoDate;
  readonly paymentTermsDays: number;
  readonly notes?: string | null;
  readonly createdBy: string;
  readonly lines: readonly QuotationLineInput[];
  readonly now: Date;
}

export interface QuotationHeaderPatch {
  readonly validUntil?: IsoDate;
  readonly paymentTermsDays?: number;
  readonly notes?: string | null;
}

export const MAX_PAYMENT_TERMS_DAYS = 365;
export const MAX_NOTES_LENGTH = 2000;

function validateHeader(args: {
  quoteDate: IsoDate;
  validUntil: IsoDate;
  paymentTermsDays: number;
  notes: string | null;
}): void {
  if (!isIsoDate(args.quoteDate)) {
    throw new InvalidQuotationError('quoteDate must be YYYY-MM-DD');
  }
  if (!isIsoDate(args.validUntil)) {
    throw new InvalidQuotationError('validUntil must be YYYY-MM-DD');
  }
  if (args.validUntil < args.quoteDate) {
    throw new InvalidQuotationError('validUntil must be on or after quoteDate');
  }
  if (
    !isInt(args.paymentTermsDays) ||
    args.paymentTermsDays < 0 ||
    args.paymentTermsDays > MAX_PAYMENT_TERMS_DAYS
  ) {
    throw new InvalidQuotationError(
      `paymentTermsDays must be an integer 0..${String(MAX_PAYMENT_TERMS_DAYS)}`,
    );
  }
  if (args.notes !== null && args.notes.length > MAX_NOTES_LENGTH) {
    throw new InvalidQuotationError(
      `notes must be <= ${String(MAX_NOTES_LENGTH)} characters`,
    );
  }
}

function normaliseNotes(notes: string | null | undefined): string | null {
  const t = (notes ?? '').trim();
  return t.length === 0 ? null : t;
}

const today = (d: Date): IsoDate => d.toISOString().slice(0, 10);

/**
 * Sales quotation (EPIC-B.1). Lifecycle
 *   DRAFT → SENT → ACCEPTED | REJECTED | EXPIRED
 *   DRAFT | SENT → CANCELLED
 * and SENT | REJECTED | EXPIRED → new DRAFT revision (same number).
 * Immutable: every mutation returns a new instance; totals are
 * recomputed from the lines on every change so they can never drift.
 */
export class Quotation {
  private constructor(private readonly s: QuotationSnapshot) {}

  static create(props: CreateQuotationProps): Quotation {
    const currency = Money.zero(props.currency).currency;
    const revision = props.revision ?? 1;
    if (!isInt(revision) || revision < 1) {
      throw new InvalidQuotationError('revision must be >= 1');
    }
    const notes = normaliseNotes(props.notes);
    validateHeader({
      quoteDate: props.quoteDate,
      validUntil: props.validUntil,
      paymentTermsDays: props.paymentTermsDays,
      notes,
    });
    if (props.number.trim().length === 0) {
      throw new InvalidQuotationError('number is required');
    }
    const lines = buildDocumentLines(props.lines, currency);
    return new Quotation({
      id: props.id,
      tenantId: props.tenantId,
      companyId: props.companyId,
      number: props.number.trim(),
      revision,
      customerId: props.customerId,
      currency,
      quoteDate: props.quoteDate,
      validUntil: props.validUntil,
      status: QuotationStatus.Draft,
      paymentTermsDays: props.paymentTermsDays,
      notes,
      ...computeDocumentTotals(lines, currency),
      version: 0,
      createdBy: props.createdBy,
      sentAt: null,
      resolvedAt: null,
      rejectReason: null,
      salesOrderId: null,
      lines,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: QuotationSnapshot): Quotation {
    return new Quotation(s);
  }

  snapshot(): QuotationSnapshot {
    return this.s;
  }

  get id(): string {
    return this.s.id;
  }
  get status(): QuotationStatus {
    return this.s.status;
  }
  get version(): number {
    return this.s.version;
  }

  private assertEditable(): void {
    if (this.s.status !== QuotationStatus.Draft) {
      throw new QuotationNotEditableError(this.s.id, this.s.status);
    }
  }

  private transition(
    to: QuotationStatus,
    now: Date,
    patch: Partial<QuotationSnapshot> = {},
  ): Quotation {
    if (!canTransition(this.s.status, to)) {
      throw new IllegalQuotationTransitionError(this.s.id, this.s.status, to);
    }
    return new Quotation({ ...this.s, ...patch, status: to, updatedAt: now });
  }

  updateHeader(patch: QuotationHeaderPatch, now: Date): Quotation {
    this.assertEditable();
    const next = {
      quoteDate: this.s.quoteDate,
      validUntil: patch.validUntil ?? this.s.validUntil,
      paymentTermsDays: patch.paymentTermsDays ?? this.s.paymentTermsDays,
      notes:
        patch.notes === undefined ? this.s.notes : normaliseNotes(patch.notes),
    };
    validateHeader(next);
    return new Quotation({ ...this.s, ...next, updatedAt: now });
  }

  replaceLines(inputs: readonly QuotationLineInput[], now: Date): Quotation {
    this.assertEditable();
    const lines = buildDocumentLines(inputs, this.s.currency);
    return new Quotation({
      ...this.s,
      lines,
      ...computeDocumentTotals(lines, this.s.currency),
      updatedAt: now,
    });
  }

  send(now: Date): Quotation {
    if (this.s.lines.length === 0) {
      throw new InvalidQuotationError(
        'a quotation needs at least one line to be sent',
      );
    }
    if (this.s.validUntil < today(now)) {
      throw new QuotationExpiredError(this.s.id, this.s.validUntil);
    }
    return this.transition(QuotationStatus.Sent, now, { sentAt: now });
  }

  accept(now: Date): Quotation {
    if (
      this.s.status === QuotationStatus.Sent &&
      this.s.validUntil < today(now)
    ) {
      throw new QuotationExpiredError(this.s.id, this.s.validUntil);
    }
    return this.transition(QuotationStatus.Accepted, now, { resolvedAt: now });
  }

  reject(reason: string | null, now: Date): Quotation {
    const r = (reason ?? '').trim();
    if (r.length > 500) {
      throw new InvalidQuotationError('reason must be <= 500 characters');
    }
    return this.transition(QuotationStatus.Rejected, now, {
      resolvedAt: now,
      rejectReason: r.length === 0 ? null : r,
    });
  }

  /** True when the expiry cron should flip this quotation to EXPIRED. */
  isDueForExpiry(onDate: IsoDate): boolean {
    return this.s.status === QuotationStatus.Sent && this.s.validUntil < onDate;
  }

  expire(now: Date): Quotation {
    return this.transition(QuotationStatus.Expired, now, { resolvedAt: now });
  }

  cancel(now: Date): Quotation {
    return this.transition(QuotationStatus.Cancelled, now, { resolvedAt: now });
  }

  get isRevisable(): boolean {
    return REVISABLE_STATUSES.includes(this.s.status);
  }

  /**
   * Builds the props for the next revision: same number, revision + 1,
   * dated today, with lines copied under the ids the caller supplies.
   */
  toRevisionProps(args: {
    readonly id: string;
    readonly lineIds: readonly string[];
    readonly createdBy: string;
    readonly validUntil: IsoDate;
    readonly now: Date;
  }): CreateQuotationProps {
    if (!this.isRevisable) {
      throw new IllegalQuotationTransitionError(
        this.s.id,
        this.s.status,
        QuotationStatus.Draft,
      );
    }
    if (args.lineIds.length !== this.s.lines.length) {
      throw new InvalidQuotationError('one new id per line is required');
    }
    return {
      id: args.id,
      tenantId: this.s.tenantId,
      companyId: this.s.companyId,
      number: this.s.number,
      revision: this.s.revision + 1,
      customerId: this.s.customerId,
      currency: this.s.currency,
      quoteDate: today(args.now),
      validUntil: args.validUntil,
      paymentTermsDays: this.s.paymentTermsDays,
      notes: this.s.notes,
      createdBy: args.createdBy,
      lines: this.s.lines.map((l, i) => ({
        id: args.lineIds[i] ?? l.id,
        itemId: l.itemId,
        itemSku: l.itemSku,
        description: l.description,
        uomCode: l.uomCode,
        quantity: l.quantity,
        unitPriceMinor: l.unitPriceMinor,
        priceSource: l.priceSource,
        priceListId: l.priceListId,
        discountBp: l.discountBp,
        taxCodeId: l.taxCodeId,
        taxCode: l.taxCode,
        taxRateBp: l.taxRateBp,
      })),
      now: args.now,
    };
  }

  /** Called by the sales-order module once the quotation is converted. */
  linkSalesOrder(salesOrderId: string, now: Date): Quotation {
    if (this.s.status !== QuotationStatus.Accepted) {
      throw new IllegalQuotationTransitionError(
        this.s.id,
        this.s.status,
        QuotationStatus.Accepted,
      );
    }
    if (this.s.salesOrderId !== null && this.s.salesOrderId !== salesOrderId) {
      throw new InvalidQuotationError(
        `quotation already converted to sales order ${this.s.salesOrderId}`,
      );
    }
    return new Quotation({ ...this.s, salesOrderId, updatedAt: now });
  }
}
