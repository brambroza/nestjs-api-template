import { isIsoDate, roundDiv, type IsoDate } from '../../../../shared/domain';

import {
  IllegalVoucherTransitionError,
  InvalidBatchError,
  InvalidVoucherError,
} from './errors';

export const PaymentMethod = {
  Cash: 'CASH',
  Transfer: 'TRANSFER',
  Cheque: 'CHEQUE',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];
export function isPaymentMethod(v: string): v is PaymentMethod {
  return (Object.values(PaymentMethod) as string[]).includes(v);
}
export const VoucherStatus = {
  Draft: 'DRAFT',
  Posted: 'POSTED',
  Void: 'VOID',
} as const;
export type VoucherStatus = (typeof VoucherStatus)[keyof typeof VoucherStatus];
export function isVoucherStatus(v: string): v is VoucherStatus {
  return (Object.values(VoucherStatus) as string[]).includes(v);
}

/** T-341: WHT on the paid share of the base, half-up to the satang. */
export function computeWhtMinor(baseMinor: bigint, rateBp: number): bigint {
  return roundDiv(baseMinor * BigInt(rateBp), 10_000n);
}

/** Pro-rates a WHT base to a partial settlement of the invoice. */
export function proratedBase(
  baseMinor: bigint,
  settlementMinor: bigint,
  invoiceTotalMinor: bigint,
): bigint {
  if (invoiceTotalMinor <= 0n) return 0n;
  if (settlementMinor >= invoiceTotalMinor) return baseMinor;
  return roundDiv(baseMinor * settlementMinor, invoiceTotalMinor);
}

export interface PaymentAllocationSnapshot {
  readonly id: string;
  readonly invoiceId: string;
  /** Gross amount settled on the invoice (cash + WHT). */
  readonly amountMinor: bigint;
  readonly whtMinor: bigint;
}

export interface PaymentVoucherSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly number: string;
  readonly vendorId: string;
  readonly batchId: string | null;
  readonly currency: string;
  readonly paymentDate: IsoDate;
  readonly method: PaymentMethod;
  readonly grossMinor: bigint;
  readonly whtMinor: bigint;
  readonly netPaidMinor: bigint;
  readonly reference: string | null;
  readonly chequeNumber: string | null;
  readonly chequeBank: string | null;
  readonly chequeDate: IsoDate | null;
  readonly notes: string | null;
  readonly status: VoucherStatus;
  readonly allocations: readonly PaymentAllocationSnapshot[];
  readonly version: number;
  readonly createdBy: string;
  readonly postedAt: Date | null;
  readonly voidedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateVoucherProps {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly number: string;
  readonly vendorId: string;
  readonly batchId?: string | null;
  readonly currency: string;
  readonly paymentDate: IsoDate;
  readonly method: PaymentMethod;
  readonly reference?: string | null;
  readonly chequeNumber?: string | null;
  readonly chequeBank?: string | null;
  readonly chequeDate?: IsoDate | null;
  readonly notes?: string | null;
  readonly createdBy: string;
  readonly allocations: readonly PaymentAllocationSnapshot[];
  readonly now: Date;
}

function text(
  v: string | null | undefined,
  max: number,
  field: string,
): string | null {
  const t = (v ?? '').trim();
  if (t.length > max)
    throw new InvalidVoucherError(
      `${field} must be <= ${String(max)} characters`,
    );
  return t.length === 0 ? null : t;
}

/** Payment voucher (T-341): gross settles invoices, WHT is withheld, net leaves the bank. */
export class PaymentVoucher {
  private constructor(private readonly s: PaymentVoucherSnapshot) {}

  static create(props: CreateVoucherProps): PaymentVoucher {
    if (!isIsoDate(props.paymentDate))
      throw new InvalidVoucherError('paymentDate must be YYYY-MM-DD');
    if (props.allocations.length === 0)
      throw new InvalidVoucherError(
        'a voucher needs at least one invoice allocation',
      );
    const seen = new Set<string>();
    let gross = 0n;
    let wht = 0n;
    for (const a of props.allocations) {
      if (a.amountMinor <= 0n)
        throw new InvalidVoucherError(
          `allocation to ${a.invoiceId} must be > 0`,
        );
      if (a.whtMinor < 0n || a.whtMinor > a.amountMinor)
        throw new InvalidVoucherError(
          `allocation to ${a.invoiceId}: WHT out of range`,
        );
      if (seen.has(a.invoiceId))
        throw new InvalidVoucherError(`invoice ${a.invoiceId} allocated twice`);
      seen.add(a.invoiceId);
      gross += a.amountMinor;
      wht += a.whtMinor;
    }
    const chequeNumber = text(props.chequeNumber, 32, 'chequeNumber');
    const chequeBank = text(props.chequeBank, 100, 'chequeBank');
    const chequeDate = props.chequeDate ?? null;
    if (props.method === PaymentMethod.Cheque) {
      if (
        !chequeNumber ||
        !chequeBank ||
        !chequeDate ||
        !isIsoDate(chequeDate)
      ) {
        throw new InvalidVoucherError(
          'a cheque payment needs chequeNumber, chequeBank and chequeDate',
        );
      }
    }
    return new PaymentVoucher({
      id: props.id,
      tenantId: props.tenantId,
      companyId: props.companyId,
      number: props.number,
      vendorId: props.vendorId,
      batchId: props.batchId ?? null,
      currency: props.currency.trim().toUpperCase(),
      paymentDate: props.paymentDate,
      method: props.method,
      grossMinor: gross,
      whtMinor: wht,
      netPaidMinor: gross - wht,
      reference: text(props.reference, 100, 'reference'),
      chequeNumber,
      chequeBank,
      chequeDate,
      notes: text(props.notes, 2000, 'notes'),
      status: VoucherStatus.Draft,
      allocations: props.allocations,
      version: 0,
      createdBy: props.createdBy,
      postedAt: null,
      voidedAt: null,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: PaymentVoucherSnapshot): PaymentVoucher {
    return new PaymentVoucher(s);
  }

  snapshot(): PaymentVoucherSnapshot {
    return this.s;
  }
  get id(): string {
    return this.s.id;
  }
  get status(): VoucherStatus {
    return this.s.status;
  }
  get version(): number {
    return this.s.version;
  }

  attachToBatch(batchId: string, now: Date): PaymentVoucher {
    if (this.s.status !== VoucherStatus.Draft)
      throw new IllegalVoucherTransitionError(
        this.s.id,
        this.s.status,
        VoucherStatus.Draft,
      );
    return new PaymentVoucher({ ...this.s, batchId, updatedAt: now });
  }

  post(now: Date): PaymentVoucher {
    if (this.s.status !== VoucherStatus.Draft)
      throw new IllegalVoucherTransitionError(
        this.s.id,
        this.s.status,
        VoucherStatus.Posted,
      );
    return new PaymentVoucher({
      ...this.s,
      status: VoucherStatus.Posted,
      postedAt: now,
      updatedAt: now,
    });
  }

  void(now: Date): PaymentVoucher {
    if (this.s.status === VoucherStatus.Void)
      throw new IllegalVoucherTransitionError(
        this.s.id,
        this.s.status,
        VoucherStatus.Void,
      );
    return new PaymentVoucher({
      ...this.s,
      status: VoucherStatus.Void,
      voidedAt: now,
      updatedAt: now,
    });
  }
}

export const BatchStatus = {
  Draft: 'DRAFT',
  Posted: 'POSTED',
  Void: 'VOID',
} as const;
export type BatchStatus = (typeof BatchStatus)[keyof typeof BatchStatus];
export function isBatchStatus(v: string): v is BatchStatus {
  return (Object.values(BatchStatus) as string[]).includes(v);
}

export interface PaymentBatchSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly number: string;
  readonly paymentDate: IsoDate;
  readonly method: PaymentMethod;
  readonly currency: string;
  readonly status: BatchStatus;
  readonly voucherCount: number;
  readonly totalNetMinor: bigint;
  readonly totalWhtMinor: bigint;
  readonly version: number;
  readonly createdBy: string;
  readonly postedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** T-344: a batch groups draft vouchers of one company / method / date and posts them together. */
export class PaymentBatch {
  private constructor(private readonly s: PaymentBatchSnapshot) {}

  static create(props: {
    id: string;
    tenantId: string;
    companyId: string;
    number: string;
    paymentDate: IsoDate;
    method: PaymentMethod;
    currency: string;
    createdBy: string;
    vouchers: readonly PaymentVoucher[];
    now: Date;
  }): PaymentBatch {
    if (!isIsoDate(props.paymentDate))
      throw new InvalidBatchError('paymentDate must be YYYY-MM-DD');
    if (props.vouchers.length === 0)
      throw new InvalidBatchError('a batch needs at least one voucher');
    let net = 0n;
    let wht = 0n;
    for (const v of props.vouchers) {
      const vs = v.snapshot();
      if (vs.status !== VoucherStatus.Draft)
        throw new InvalidBatchError(`voucher ${vs.number} is ${vs.status}`);
      if (
        vs.companyId !== props.companyId ||
        vs.method !== props.method ||
        vs.currency !== props.currency
      ) {
        throw new InvalidBatchError(
          `voucher ${vs.number} does not share the batch company / method / currency`,
        );
      }
      net += vs.netPaidMinor;
      wht += vs.whtMinor;
    }
    return new PaymentBatch({
      id: props.id,
      tenantId: props.tenantId,
      companyId: props.companyId,
      number: props.number,
      paymentDate: props.paymentDate,
      method: props.method,
      currency: props.currency,
      status: BatchStatus.Draft,
      voucherCount: props.vouchers.length,
      totalNetMinor: net,
      totalWhtMinor: wht,
      version: 0,
      createdBy: props.createdBy,
      postedAt: null,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: PaymentBatchSnapshot): PaymentBatch {
    return new PaymentBatch(s);
  }
  snapshot(): PaymentBatchSnapshot {
    return this.s;
  }
  get id(): string {
    return this.s.id;
  }
  get version(): number {
    return this.s.version;
  }

  post(now: Date): PaymentBatch {
    if (this.s.status !== BatchStatus.Draft)
      throw new InvalidBatchError(`batch ${this.s.number} is ${this.s.status}`);
    return new PaymentBatch({
      ...this.s,
      status: BatchStatus.Posted,
      postedAt: now,
      updatedAt: now,
    });
  }

  void(now: Date): PaymentBatch {
    if (this.s.status !== BatchStatus.Draft)
      throw new InvalidBatchError(`batch ${this.s.number} is ${this.s.status}`);
    return new PaymentBatch({
      ...this.s,
      status: BatchStatus.Void,
      updatedAt: now,
    });
  }
}
