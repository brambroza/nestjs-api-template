import {
  Money,
  isIsoDate,
  sumMoney,
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

export const PriceSource = {
  PriceList: 'PRICE_LIST',
  Manual: 'MANUAL',
} as const;
export type PriceSource = (typeof PriceSource)[keyof typeof PriceSource];
export function isPriceSource(v: string): v is PriceSource {
  return (Object.values(PriceSource) as string[]).includes(v);
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

export class SalesRefInvalidError extends DomainError {
  readonly code = 'SALES.REF_INVALID';
}

export class CurrencyMismatchError extends DomainError {
  readonly code = 'SALES.CURRENCY_MISMATCH';
  constructor(
    readonly documentCurrency: string,
    readonly priceCurrency: string,
    readonly itemId: string,
  ) {
    super(
      `Item ${itemId} is priced in ${priceCurrency} but the document is in ${documentCurrency}`,
    );
  }
}

// ---- lines -----------------------------------------------------------------

export const MAX_LINES = 500;
export const MAX_DISCOUNT_BP = 10_000;

/** A line as the application layer hands it in: already priced and taxed. */
export interface QuotationLineInput {
  readonly id: string;
  readonly itemId: string;
  readonly itemSku: string;
  readonly description: string;
  readonly uomCode: string;
  readonly quantity: bigint;
  readonly unitPriceMinor: bigint;
  readonly priceSource: PriceSource;
  readonly priceListId: string | null;
  readonly discountBp: number;
  readonly taxCodeId: string;
  readonly taxCode: string;
  readonly taxRateBp: number;
}

export interface QuotationLineSnapshot extends QuotationLineInput {
  readonly lineNo: number;
  readonly discountMinor: bigint;
  readonly netMinor: bigint;
  readonly taxMinor: bigint;
  readonly totalMinor: bigint;
}

export interface QuotationTotals {
  readonly subtotalMinor: bigint;
  readonly discountMinor: bigint;
  readonly taxMinor: bigint;
  readonly totalMinor: bigint;
}

function isInt(v: number): boolean {
  return Number.isInteger(v);
}

/**
 * Pure line arithmetic. gross = unit × qty; discount = gross × bp;
 * net = gross − discount; tax = net × rate; total = net + tax. Every
 * rounding is half-up at the satang (Money.percent), applied per line
 * — the Thai Revenue Department accepts per-line VAT rounding as long
 * as the invoice total is the sum of the lines, which it is here.
 */
export function computeLine(
  input: QuotationLineInput,
  currency: string,
  lineNo: number,
): QuotationLineSnapshot {
  if (input.quantity <= 0n) {
    throw new InvalidQuotationError(
      `line ${String(lineNo)}: quantity must be > 0`,
    );
  }
  if (input.unitPriceMinor < 0n) {
    throw new InvalidQuotationError(
      `line ${String(lineNo)}: unit price must be >= 0`,
    );
  }
  if (
    !isInt(input.discountBp) ||
    input.discountBp < 0 ||
    input.discountBp > MAX_DISCOUNT_BP
  ) {
    throw new InvalidQuotationError(
      `line ${String(lineNo)}: discountBp must be an integer 0..${String(MAX_DISCOUNT_BP)}`,
    );
  }
  if (!isInt(input.taxRateBp) || input.taxRateBp < 0) {
    throw new InvalidQuotationError(
      `line ${String(lineNo)}: taxRateBp must be >= 0`,
    );
  }
  const description = input.description.trim();
  if (description.length === 0 || description.length > 200) {
    throw new InvalidQuotationError(
      `line ${String(lineNo)}: description must be 1..200 characters`,
    );
  }
  const uomCode = input.uomCode.trim().toUpperCase();
  if (uomCode.length === 0) {
    throw new InvalidQuotationError(
      `line ${String(lineNo)}: uomCode is required`,
    );
  }
  const gross = Money.of(input.unitPriceMinor, currency).multiply(
    input.quantity,
  );
  const discount = gross.percent(BigInt(input.discountBp));
  const net = gross.subtract(discount);
  const tax = net.percent(BigInt(input.taxRateBp));
  const total = net.add(tax);
  return {
    ...input,
    description,
    uomCode,
    lineNo,
    discountMinor: discount.amount,
    netMinor: net.amount,
    taxMinor: tax.amount,
    totalMinor: total.amount,
  };
}

export function computeTotals(
  lines: readonly QuotationLineSnapshot[],
  currency: string,
): QuotationTotals {
  const gross = sumMoney(
    lines.map((l) => Money.of(l.unitPriceMinor, currency).multiply(l.quantity)),
    currency,
  );
  const discount = sumMoney(
    lines.map((l) => Money.of(l.discountMinor, currency)),
    currency,
  );
  const tax = sumMoney(
    lines.map((l) => Money.of(l.taxMinor, currency)),
    currency,
  );
  const total = gross.subtract(discount).add(tax);
  return {
    subtotalMinor: gross.amount,
    discountMinor: discount.amount,
    taxMinor: tax.amount,
    totalMinor: total.amount,
  };
}

function buildLines(
  inputs: readonly QuotationLineInput[],
  currency: string,
): readonly QuotationLineSnapshot[] {
  if (inputs.length > MAX_LINES) {
    throw new InvalidQuotationError(
      `a quotation has at most ${String(MAX_LINES)} lines`,
    );
  }
  const ids = new Set<string>();
  for (const l of inputs) {
    if (ids.has(l.id))
      throw new InvalidQuotationError(`duplicate line id ${l.id}`);
    ids.add(l.id);
  }
  return inputs.map((l, i) => computeLine(l, currency, i + 1));
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
    const lines = buildLines(props.lines, currency);
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
      ...computeTotals(lines, currency),
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
    const lines = buildLines(inputs, this.s.currency);
    return new Quotation({
      ...this.s,
      lines,
      ...computeTotals(lines, this.s.currency),
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
