import { isIsoDate, type IsoDate } from '../../../../shared/domain';

import { IllegalReceiptTransitionError, InvalidReceiptError } from './errors';

export const ReceiptMethod = {
  Cash: 'CASH',
  Transfer: 'TRANSFER',
  Cheque: 'CHEQUE',
  PromptPay: 'PROMPTPAY',
} as const;
export type ReceiptMethod = (typeof ReceiptMethod)[keyof typeof ReceiptMethod];
export function isReceiptMethod(v: string): v is ReceiptMethod {
  return (Object.values(ReceiptMethod) as string[]).includes(v);
}

export const ReceiptStatus = {
  Draft: 'DRAFT',
  Posted: 'POSTED',
  Void: 'VOID',
} as const;
export type ReceiptStatus = (typeof ReceiptStatus)[keyof typeof ReceiptStatus];
export function isReceiptStatus(v: string): v is ReceiptStatus {
  return (Object.values(ReceiptStatus) as string[]).includes(v);
}

export interface AllocationSnapshot {
  readonly id: string;
  readonly invoiceId: string;
  readonly amountMinor: bigint;
}

export interface ReceiptSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly number: string;
  readonly customerId: string;
  readonly currency: string;
  readonly receiptDate: IsoDate;
  readonly method: ReceiptMethod;
  readonly amountMinor: bigint;
  readonly whtMinor: bigint;
  readonly reference: string | null;
  readonly chequeNumber: string | null;
  readonly chequeBank: string | null;
  readonly chequeDate: IsoDate | null;
  readonly notes: string | null;
  readonly status: ReceiptStatus;
  readonly allocations: readonly AllocationSnapshot[];
  readonly version: number;
  readonly createdBy: string;
  readonly postedAt: Date | null;
  readonly voidedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateReceiptProps {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly number: string;
  readonly customerId: string;
  readonly currency: string;
  readonly receiptDate: IsoDate;
  readonly method: ReceiptMethod;
  readonly amountMinor: bigint;
  readonly whtMinor?: bigint;
  readonly reference?: string | null;
  readonly chequeNumber?: string | null;
  readonly chequeBank?: string | null;
  readonly chequeDate?: IsoDate | null;
  readonly notes?: string | null;
  readonly createdBy: string;
  readonly allocations?: readonly AllocationSnapshot[];
  readonly now: Date;
}

function text(
  v: string | null | undefined,
  max: number,
  field: string,
): string | null {
  const t = (v ?? '').trim();
  if (t.length > max)
    throw new InvalidReceiptError(
      `${field} must be <= ${String(max)} characters`,
    );
  return t.length === 0 ? null : t;
}

function validateAllocations(
  allocs: readonly AllocationSnapshot[],
  settlement: bigint,
): void {
  const seen = new Set<string>();
  let sum = 0n;
  for (const a of allocs) {
    if (a.amountMinor <= 0n)
      throw new InvalidReceiptError(`allocation to ${a.invoiceId} must be > 0`);
    if (seen.has(a.invoiceId))
      throw new InvalidReceiptError(`invoice ${a.invoiceId} allocated twice`);
    seen.add(a.invoiceId);
    sum += a.amountMinor;
  }
  if (sum > settlement) {
    throw new InvalidReceiptError(
      `allocations (${sum.toString()}) exceed the receipt settlement (${settlement.toString()})`,
    );
  }
}

/**
 * Customer receipt (T-333). Cash + withheld tax settle invoices through
 * allocations; posting applies them, voiding reverses them. Method
 * specific fields are mandatory (cheque number/bank/date, transfer ref).
 */
export class Receipt {
  private constructor(private readonly s: ReceiptSnapshot) {}

  static create(props: CreateReceiptProps): Receipt {
    if (!isIsoDate(props.receiptDate))
      throw new InvalidReceiptError('receiptDate must be YYYY-MM-DD');
    const wht = props.whtMinor ?? 0n;
    if (props.amountMinor < 0n || wht < 0n)
      throw new InvalidReceiptError('amounts must be >= 0');
    if (props.amountMinor + wht <= 0n)
      throw new InvalidReceiptError('a receipt must settle something');
    const reference = text(props.reference, 100, 'reference');
    const chequeNumber = text(props.chequeNumber, 32, 'chequeNumber');
    const chequeBank = text(props.chequeBank, 100, 'chequeBank');
    const chequeDate = props.chequeDate ?? null;
    if (props.method === ReceiptMethod.Cheque) {
      if (!chequeNumber || !chequeBank || !chequeDate) {
        throw new InvalidReceiptError(
          'a cheque receipt needs chequeNumber, chequeBank and chequeDate',
        );
      }
      if (!isIsoDate(chequeDate))
        throw new InvalidReceiptError('chequeDate must be YYYY-MM-DD');
    }
    if (props.method === ReceiptMethod.Transfer && !reference) {
      throw new InvalidReceiptError(
        'a transfer receipt needs the bank reference',
      );
    }
    const allocations = props.allocations ?? [];
    validateAllocations(allocations, props.amountMinor + wht);
    return new Receipt({
      id: props.id,
      tenantId: props.tenantId,
      companyId: props.companyId,
      number: props.number,
      customerId: props.customerId,
      currency: props.currency.trim().toUpperCase(),
      receiptDate: props.receiptDate,
      method: props.method,
      amountMinor: props.amountMinor,
      whtMinor: wht,
      reference,
      chequeNumber,
      chequeBank,
      chequeDate,
      notes: text(props.notes, 2000, 'notes'),
      status: ReceiptStatus.Draft,
      allocations,
      version: 0,
      createdBy: props.createdBy,
      postedAt: null,
      voidedAt: null,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: ReceiptSnapshot): Receipt {
    return new Receipt(s);
  }

  snapshot(): ReceiptSnapshot {
    return this.s;
  }
  get id(): string {
    return this.s.id;
  }
  get status(): ReceiptStatus {
    return this.s.status;
  }
  get version(): number {
    return this.s.version;
  }
  /** What the receipt settles on invoices: cash received + tax withheld by the customer. */
  get settlementMinor(): bigint {
    return this.s.amountMinor + this.s.whtMinor;
  }
  get allocatedMinor(): bigint {
    return this.s.allocations.reduce((sum, a) => sum + a.amountMinor, 0n);
  }
  get unappliedMinor(): bigint {
    return this.settlementMinor - this.allocatedMinor;
  }

  setAllocations(
    allocations: readonly AllocationSnapshot[],
    now: Date,
  ): Receipt {
    if (this.s.status !== ReceiptStatus.Draft) {
      throw new IllegalReceiptTransitionError(
        this.s.id,
        this.s.status,
        ReceiptStatus.Draft,
      );
    }
    validateAllocations(allocations, this.settlementMinor);
    return new Receipt({ ...this.s, allocations, updatedAt: now });
  }

  post(now: Date): Receipt {
    if (this.s.status !== ReceiptStatus.Draft) {
      throw new IllegalReceiptTransitionError(
        this.s.id,
        this.s.status,
        ReceiptStatus.Posted,
      );
    }
    return new Receipt({
      ...this.s,
      status: ReceiptStatus.Posted,
      postedAt: now,
      updatedAt: now,
    });
  }

  void(now: Date): Receipt {
    if (this.s.status === ReceiptStatus.Void) {
      throw new IllegalReceiptTransitionError(
        this.s.id,
        this.s.status,
        ReceiptStatus.Void,
      );
    }
    return new Receipt({
      ...this.s,
      status: ReceiptStatus.Void,
      voidedAt: now,
      updatedAt: now,
    });
  }
}
