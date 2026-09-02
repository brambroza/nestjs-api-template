import {
  Money,
  addDays,
  buildDocumentLines,
  computeDocumentTotals,
  isIsoDate,
  type DocumentLineInput,
  type DocumentLineSnapshot,
  type DocumentTotals,
  type IsoDate,
} from '../../../../shared/domain';

import {
  IllegalInvoiceTransitionError,
  InvalidInvoiceError,
  InvoiceNotEditableError,
  SettlementExceedsBalanceError,
} from './errors';

export const InvoiceType = {
  Invoice: 'INVOICE',
  CreditNote: 'CREDIT_NOTE',
  DebitNote: 'DEBIT_NOTE',
} as const;
export type InvoiceType = (typeof InvoiceType)[keyof typeof InvoiceType];
export function isInvoiceType(v: string): v is InvoiceType {
  return (Object.values(InvoiceType) as string[]).includes(v);
}

export const InvoiceStatus = {
  Draft: 'DRAFT',
  Issued: 'ISSUED',
  PartiallyPaid: 'PARTIALLY_PAID',
  Paid: 'PAID',
  Applied: 'APPLIED',
  Void: 'VOID',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];
export function isInvoiceStatus(v: string): v is InvoiceStatus {
  return (Object.values(InvoiceStatus) as string[]).includes(v);
}

/** Statuses that carry an open receivable. */
export const OPEN_STATUSES: readonly InvoiceStatus[] = [
  'ISSUED',
  'PARTIALLY_PAID',
];

export const NoteReason = {
  Return: 'RETURN',
  PriceAdjustment: 'PRICE_ADJUSTMENT',
  Discount: 'DISCOUNT',
  QuantityError: 'QUANTITY_ERROR',
  Other: 'OTHER',
} as const;
export type NoteReason = (typeof NoteReason)[keyof typeof NoteReason];
export function isNoteReason(v: string): v is NoteReason {
  return (Object.values(NoteReason) as string[]).includes(v);
}

export interface SalesInvoiceLineInput extends DocumentLineInput {
  readonly salesOrderLineId: string | null;
}
export interface SalesInvoiceLineSnapshot extends DocumentLineSnapshot {
  readonly salesOrderLineId: string | null;
}

export interface CustomerIdentity {
  readonly customerId: string;
  readonly customerName: string;
  readonly customerTaxId: string | null;
  readonly customerBranchNumber: string | null;
  readonly billingAddress: string | null;
}

export interface SalesInvoiceSnapshot extends DocumentTotals, CustomerIdentity {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly branchId: string;
  readonly number: string | null;
  readonly type: InvoiceType;
  readonly originalInvoiceId: string | null;
  readonly reason: NoteReason | null;
  readonly reasonText: string | null;
  readonly salesOrderId: string | null;
  readonly currency: string;
  readonly invoiceDate: IsoDate;
  readonly dueDate: IsoDate;
  readonly paymentTermsDays: number;
  readonly status: InvoiceStatus;
  readonly settledMinor: bigint;
  readonly balanceMinor: bigint;
  readonly notes: string | null;
  readonly version: number;
  readonly createdBy: string;
  readonly issuedAt: Date | null;
  readonly voidedAt: Date | null;
  readonly voidReason: string | null;
  readonly lines: readonly SalesInvoiceLineSnapshot[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateInvoiceProps extends CustomerIdentity {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly branchId: string;
  readonly type?: InvoiceType;
  readonly originalInvoiceId?: string | null;
  readonly reason?: NoteReason | null;
  readonly reasonText?: string | null;
  readonly salesOrderId?: string | null;
  readonly currency: string;
  readonly invoiceDate: IsoDate;
  readonly paymentTermsDays: number;
  readonly notes?: string | null;
  readonly createdBy: string;
  readonly lines: readonly SalesInvoiceLineInput[];
  readonly now: Date;
}

export const MAX_PAYMENT_TERMS_DAYS = 365;

function withOrderLine(
  lines: readonly DocumentLineSnapshot[],
  inputs: readonly SalesInvoiceLineInput[],
): SalesInvoiceLineSnapshot[] {
  const byId = new Map(inputs.map((l) => [l.id, l.salesOrderLineId]));
  return lines.map((l) => ({ ...l, salesOrderLineId: byId.get(l.id) ?? null }));
}

function normalise(
  v: string | null | undefined,
  max: number,
  field: string,
): string | null {
  const t = (v ?? '').trim();
  if (t.length > max)
    throw new InvalidInvoiceError(
      `${field} must be <= ${String(max)} characters`,
    );
  return t.length === 0 ? null : t;
}

/**
 * Sales invoice / tax invoice (T-330) and its notes (T-332). The
 * tax-invoice number is assigned at ISSUE by the gapless per-branch
 * sequence; customer identity is frozen at creation. Settlement =
 * receipts + credit notes; balance = total − settled.
 */
export class SalesInvoice {
  private constructor(private readonly s: SalesInvoiceSnapshot) {}

  static create(props: CreateInvoiceProps): SalesInvoice {
    const currency = Money.zero(props.currency).currency;
    const type = props.type ?? InvoiceType.Invoice;
    if (!isIsoDate(props.invoiceDate))
      throw new InvalidInvoiceError('invoiceDate must be YYYY-MM-DD');
    if (
      !Number.isInteger(props.paymentTermsDays) ||
      props.paymentTermsDays < 0 ||
      props.paymentTermsDays > MAX_PAYMENT_TERMS_DAYS
    ) {
      throw new InvalidInvoiceError(
        `paymentTermsDays must be an integer 0..${String(MAX_PAYMENT_TERMS_DAYS)}`,
      );
    }
    if (type !== InvoiceType.Invoice) {
      if (!props.originalInvoiceId)
        throw new InvalidInvoiceError(`${type} needs an original invoice`);
      if (!props.reason)
        throw new InvalidInvoiceError(`${type} needs a reason`);
    }
    const customerName = props.customerName.trim();
    if (customerName.length === 0)
      throw new InvalidInvoiceError('customerName is required');
    const lines = withOrderLine(
      buildDocumentLines(props.lines, currency),
      props.lines,
    );
    const totals = computeDocumentTotals(lines, currency);
    return new SalesInvoice({
      id: props.id,
      tenantId: props.tenantId,
      companyId: props.companyId,
      branchId: props.branchId,
      number: null,
      type,
      originalInvoiceId: props.originalInvoiceId ?? null,
      reason: props.reason ?? null,
      reasonText: normalise(props.reasonText, 500, 'reasonText'),
      customerId: props.customerId,
      customerName,
      customerTaxId: normalise(props.customerTaxId, 20, 'customerTaxId'),
      customerBranchNumber: normalise(
        props.customerBranchNumber,
        5,
        'customerBranchNumber',
      ),
      billingAddress: normalise(props.billingAddress, 500, 'billingAddress'),
      salesOrderId: props.salesOrderId ?? null,
      currency,
      invoiceDate: props.invoiceDate,
      dueDate: addDays(props.invoiceDate, props.paymentTermsDays),
      paymentTermsDays: props.paymentTermsDays,
      status: InvoiceStatus.Draft,
      ...totals,
      settledMinor: 0n,
      balanceMinor: totals.totalMinor,
      notes: normalise(props.notes, 2000, 'notes'),
      version: 0,
      createdBy: props.createdBy,
      issuedAt: null,
      voidedAt: null,
      voidReason: null,
      lines,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: SalesInvoiceSnapshot): SalesInvoice {
    return new SalesInvoice(s);
  }

  snapshot(): SalesInvoiceSnapshot {
    return this.s;
  }
  get id(): string {
    return this.s.id;
  }
  get status(): InvoiceStatus {
    return this.s.status;
  }
  get version(): number {
    return this.s.version;
  }
  get isOpen(): boolean {
    return OPEN_STATUSES.includes(this.s.status);
  }

  private assertEditable(): void {
    if (this.s.status !== InvoiceStatus.Draft)
      throw new InvoiceNotEditableError(this.s.id, this.s.status);
  }

  updateHeader(
    patch: {
      readonly invoiceDate?: IsoDate;
      readonly paymentTermsDays?: number;
      readonly notes?: string | null;
    },
    now: Date,
  ): SalesInvoice {
    this.assertEditable();
    const invoiceDate = patch.invoiceDate ?? this.s.invoiceDate;
    const terms = patch.paymentTermsDays ?? this.s.paymentTermsDays;
    if (!isIsoDate(invoiceDate))
      throw new InvalidInvoiceError('invoiceDate must be YYYY-MM-DD');
    if (
      !Number.isInteger(terms) ||
      terms < 0 ||
      terms > MAX_PAYMENT_TERMS_DAYS
    ) {
      throw new InvalidInvoiceError('paymentTermsDays out of range');
    }
    return new SalesInvoice({
      ...this.s,
      invoiceDate,
      paymentTermsDays: terms,
      dueDate: addDays(invoiceDate, terms),
      notes:
        patch.notes === undefined
          ? this.s.notes
          : normalise(patch.notes, 2000, 'notes'),
      updatedAt: now,
    });
  }

  replaceLines(
    inputs: readonly SalesInvoiceLineInput[],
    now: Date,
  ): SalesInvoice {
    this.assertEditable();
    const lines = withOrderLine(
      buildDocumentLines(inputs, this.s.currency),
      inputs,
    );
    const totals = computeDocumentTotals(lines, this.s.currency);
    return new SalesInvoice({
      ...this.s,
      lines,
      ...totals,
      balanceMinor: totals.totalMinor - this.s.settledMinor,
      updatedAt: now,
    });
  }

  /** DRAFT → ISSUED with the tax-invoice number the sequence handed out. */
  issue(number: string, now: Date): SalesInvoice {
    if (this.s.status !== InvoiceStatus.Draft) {
      throw new IllegalInvoiceTransitionError(
        this.s.id,
        this.s.status,
        InvoiceStatus.Issued,
      );
    }
    if (this.s.lines.length === 0)
      throw new InvalidInvoiceError('an invoice needs at least one line');
    if (this.s.totalMinor <= 0n)
      throw new InvalidInvoiceError('total must be > 0');
    if (number.trim().length === 0)
      throw new InvalidInvoiceError('number is required');
    return new SalesInvoice({
      ...this.s,
      number: number.trim(),
      status: InvoiceStatus.Issued,
      issuedAt: now,
      updatedAt: now,
    });
  }

  /** Receipt allocation or credit note applied against this invoice. */
  applySettlement(amountMinor: bigint, now: Date): SalesInvoice {
    if (!this.isOpen) {
      throw new IllegalInvoiceTransitionError(
        this.s.id,
        this.s.status,
        InvoiceStatus.PartiallyPaid,
      );
    }
    if (amountMinor <= 0n)
      throw new InvalidInvoiceError('settlement must be > 0');
    if (amountMinor > this.s.balanceMinor) {
      throw new SettlementExceedsBalanceError(
        this.s.id,
        this.s.balanceMinor,
        amountMinor,
      );
    }
    const settled = this.s.settledMinor + amountMinor;
    const balance = this.s.totalMinor - settled;
    return new SalesInvoice({
      ...this.s,
      settledMinor: settled,
      balanceMinor: balance,
      status: balance === 0n ? InvoiceStatus.Paid : InvoiceStatus.PartiallyPaid,
      updatedAt: now,
    });
  }

  /** Voided receipt: put the amount back on the balance. */
  reverseSettlement(amountMinor: bigint, now: Date): SalesInvoice {
    if (
      this.s.status !== InvoiceStatus.Paid &&
      this.s.status !== InvoiceStatus.PartiallyPaid
    ) {
      throw new IllegalInvoiceTransitionError(
        this.s.id,
        this.s.status,
        InvoiceStatus.Issued,
      );
    }
    if (amountMinor <= 0n || amountMinor > this.s.settledMinor) {
      throw new InvalidInvoiceError('reversal exceeds what was settled');
    }
    const settled = this.s.settledMinor - amountMinor;
    return new SalesInvoice({
      ...this.s,
      settledMinor: settled,
      balanceMinor: this.s.totalMinor - settled,
      status:
        settled === 0n ? InvoiceStatus.Issued : InvoiceStatus.PartiallyPaid,
      updatedAt: now,
    });
  }

  /** Credit note bookkeeping: it is fully consumed by the original the moment it is issued. */
  markApplied(now: Date): SalesInvoice {
    if (
      this.s.type !== InvoiceType.CreditNote ||
      this.s.status !== InvoiceStatus.Issued
    ) {
      throw new IllegalInvoiceTransitionError(
        this.s.id,
        this.s.status,
        InvoiceStatus.Applied,
      );
    }
    return new SalesInvoice({
      ...this.s,
      status: InvoiceStatus.Applied,
      settledMinor: this.s.totalMinor,
      balanceMinor: 0n,
      updatedAt: now,
    });
  }

  /** Only an unsettled document can be voided; a paid one needs a credit note. */
  void(reason: string, now: Date): SalesInvoice {
    if (
      this.s.status !== InvoiceStatus.Draft &&
      this.s.status !== InvoiceStatus.Issued
    ) {
      throw new IllegalInvoiceTransitionError(
        this.s.id,
        this.s.status,
        InvoiceStatus.Void,
      );
    }
    const r = reason.trim();
    if (r.length === 0 || r.length > 500)
      throw new InvalidInvoiceError('void reason must be 1..500 characters');
    return new SalesInvoice({
      ...this.s,
      status: InvoiceStatus.Void,
      balanceMinor: 0n,
      voidedAt: now,
      voidReason: r,
      updatedAt: now,
    });
  }
}
