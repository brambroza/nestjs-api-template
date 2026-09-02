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
  ApSettlementExceedsBalanceError,
  IllegalVendorInvoiceTransitionError,
  InvalidVendorInvoiceError,
  MatchVarianceError,
} from './errors';
import { MatchStatus } from './three-way-match';

export const VendorInvoiceStatus = {
  Draft: 'DRAFT',
  Open: 'OPEN',
  PartiallyPaid: 'PARTIALLY_PAID',
  Paid: 'PAID',
  Void: 'VOID',
} as const;
export type VendorInvoiceStatus =
  (typeof VendorInvoiceStatus)[keyof typeof VendorInvoiceStatus];
export function isVendorInvoiceStatus(v: string): v is VendorInvoiceStatus {
  return (Object.values(VendorInvoiceStatus) as string[]).includes(v);
}
export const AP_OPEN_STATUSES: readonly VendorInvoiceStatus[] = [
  'OPEN',
  'PARTIALLY_PAID',
];

export interface WhtInfo {
  readonly whtTaxCodeId: string | null;
  readonly whtTaxCode: string | null;
  readonly whtRateBp: number;
  readonly whtPndForm: string | null;
  readonly whtIncomeType: string | null;
}

export interface VendorInvoiceLineInput extends DocumentLineInput, WhtInfo {
  readonly purchaseOrderLineId: string | null;
}
export interface VendorInvoiceLineSnapshot
  extends DocumentLineSnapshot, WhtInfo {
  readonly purchaseOrderLineId: string | null;
}

export interface VendorInvoiceSnapshot extends DocumentTotals {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly number: string;
  readonly vendorInvoiceNumber: string;
  readonly vendorId: string;
  readonly vendorName: string;
  readonly vendorTaxId: string | null;
  readonly purchaseOrderId: string | null;
  readonly currency: string;
  readonly invoiceDate: IsoDate;
  readonly dueDate: IsoDate;
  readonly paymentTermsDays: number;
  readonly status: VendorInvoiceStatus;
  readonly matchStatus: MatchStatus;
  readonly matchIssues: readonly string[];
  readonly settledMinor: bigint;
  readonly balanceMinor: bigint;
  readonly notes: string | null;
  readonly version: number;
  readonly createdBy: string;
  readonly postedAt: Date | null;
  readonly voidedAt: Date | null;
  readonly voidReason: string | null;
  readonly lines: readonly VendorInvoiceLineSnapshot[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateVendorInvoiceProps {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly number: string;
  readonly vendorInvoiceNumber: string;
  readonly vendorId: string;
  readonly vendorName: string;
  readonly vendorTaxId: string | null;
  readonly purchaseOrderId?: string | null;
  readonly currency: string;
  readonly invoiceDate: IsoDate;
  readonly paymentTermsDays: number;
  readonly notes?: string | null;
  readonly createdBy: string;
  readonly lines: readonly VendorInvoiceLineInput[];
  readonly match: {
    readonly status: MatchStatus;
    readonly issues: readonly string[];
  };
  readonly now: Date;
}

function decorate(
  lines: readonly DocumentLineSnapshot[],
  inputs: readonly VendorInvoiceLineInput[],
): VendorInvoiceLineSnapshot[] {
  const byId = new Map(inputs.map((l) => [l.id, l]));
  return lines.map((l) => {
    const i = byId.get(l.id);
    return {
      ...l,
      purchaseOrderLineId: i?.purchaseOrderLineId ?? null,
      whtTaxCodeId: i?.whtTaxCodeId ?? null,
      whtTaxCode: i?.whtTaxCode ?? null,
      whtRateBp: i?.whtRateBp ?? 0,
      whtPndForm: i?.whtPndForm ?? null,
      whtIncomeType: i?.whtIncomeType ?? null,
    };
  });
}

/**
 * Vendor invoice (T-340). DRAFT → OPEN (posted; must be MATCHED unless a
 * variance is explicitly accepted) → PARTIALLY_PAID → PAID; DRAFT/OPEN
 * → VOID. WHT is not deducted here — it is withheld when paying.
 */
export class VendorInvoice {
  private constructor(private readonly s: VendorInvoiceSnapshot) {}

  static create(props: CreateVendorInvoiceProps): VendorInvoice {
    const currency = Money.zero(props.currency).currency;
    if (!isIsoDate(props.invoiceDate))
      throw new InvalidVendorInvoiceError('invoiceDate must be YYYY-MM-DD');
    if (
      !Number.isInteger(props.paymentTermsDays) ||
      props.paymentTermsDays < 0 ||
      props.paymentTermsDays > 365
    ) {
      throw new InvalidVendorInvoiceError(
        'paymentTermsDays must be an integer 0..365',
      );
    }
    const vendorInvoiceNumber = props.vendorInvoiceNumber.trim();
    if (vendorInvoiceNumber.length === 0 || vendorInvoiceNumber.length > 64) {
      throw new InvalidVendorInvoiceError(
        'vendorInvoiceNumber must be 1..64 characters',
      );
    }
    for (const l of props.lines) {
      if (
        !Number.isInteger(l.whtRateBp) ||
        l.whtRateBp < 0 ||
        l.whtRateBp > 10_000
      ) {
        throw new InvalidVendorInvoiceError(
          'whtRateBp must be an integer 0..10000',
        );
      }
    }
    const lines = decorate(
      buildDocumentLines(props.lines, currency),
      props.lines,
    );
    const totals = computeDocumentTotals(lines, currency);
    const notes = (props.notes ?? '').trim() || null;
    return new VendorInvoice({
      id: props.id,
      tenantId: props.tenantId,
      companyId: props.companyId,
      number: props.number,
      vendorInvoiceNumber,
      vendorId: props.vendorId,
      vendorName: props.vendorName.trim(),
      vendorTaxId: props.vendorTaxId,
      purchaseOrderId: props.purchaseOrderId ?? null,
      currency,
      invoiceDate: props.invoiceDate,
      dueDate: addDays(props.invoiceDate, props.paymentTermsDays),
      paymentTermsDays: props.paymentTermsDays,
      status: VendorInvoiceStatus.Draft,
      matchStatus: props.match.status,
      matchIssues: props.match.issues,
      ...totals,
      settledMinor: 0n,
      balanceMinor: totals.totalMinor,
      notes,
      version: 0,
      createdBy: props.createdBy,
      postedAt: null,
      voidedAt: null,
      voidReason: null,
      lines,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: VendorInvoiceSnapshot): VendorInvoice {
    return new VendorInvoice(s);
  }

  snapshot(): VendorInvoiceSnapshot {
    return this.s;
  }
  get id(): string {
    return this.s.id;
  }
  get status(): VendorInvoiceStatus {
    return this.s.status;
  }
  get version(): number {
    return this.s.version;
  }
  get isOpen(): boolean {
    return AP_OPEN_STATUSES.includes(this.s.status);
  }

  /** Net (ex-VAT) amount of the lines that carry WHT, per (tax code) — the WHT base. */
  whtBases(): ReadonlyArray<{
    readonly taxCode: string;
    readonly rateBp: number;
    readonly pndForm: string | null;
    readonly incomeType: string | null;
    readonly baseMinor: bigint;
  }> {
    const groups = new Map<
      string,
      {
        taxCode: string;
        rateBp: number;
        pndForm: string | null;
        incomeType: string | null;
        baseMinor: bigint;
      }
    >();
    for (const l of this.s.lines) {
      if (!l.whtTaxCode || l.whtRateBp <= 0) continue;
      const g = groups.get(l.whtTaxCode) ?? {
        taxCode: l.whtTaxCode,
        rateBp: l.whtRateBp,
        pndForm: l.whtPndForm,
        incomeType: l.whtIncomeType,
        baseMinor: 0n,
      };
      g.baseMinor += l.netMinor;
      groups.set(l.whtTaxCode, g);
    }
    return [...groups.values()];
  }

  /** DRAFT → OPEN. A VARIANCE / UNMATCHED invoice needs `acceptVariance` (an explicit, audited choice). */
  post(now: Date, acceptVariance = false): VendorInvoice {
    if (this.s.status !== VendorInvoiceStatus.Draft) {
      throw new IllegalVendorInvoiceTransitionError(
        this.s.id,
        this.s.status,
        VendorInvoiceStatus.Open,
      );
    }
    if (this.s.lines.length === 0 || this.s.totalMinor <= 0n)
      throw new InvalidVendorInvoiceError('nothing to post');
    if (this.s.matchStatus !== MatchStatus.Matched && !acceptVariance) {
      throw new MatchVarianceError(this.s.id, this.s.matchIssues);
    }
    return new VendorInvoice({
      ...this.s,
      status: VendorInvoiceStatus.Open,
      postedAt: now,
      updatedAt: now,
    });
  }

  applySettlement(amountMinor: bigint, now: Date): VendorInvoice {
    if (!this.isOpen)
      throw new IllegalVendorInvoiceTransitionError(
        this.s.id,
        this.s.status,
        VendorInvoiceStatus.PartiallyPaid,
      );
    if (amountMinor <= 0n)
      throw new InvalidVendorInvoiceError('settlement must be > 0');
    if (amountMinor > this.s.balanceMinor)
      throw new ApSettlementExceedsBalanceError(
        this.s.id,
        this.s.balanceMinor,
        amountMinor,
      );
    const settled = this.s.settledMinor + amountMinor;
    const balance = this.s.totalMinor - settled;
    return new VendorInvoice({
      ...this.s,
      settledMinor: settled,
      balanceMinor: balance,
      status:
        balance === 0n
          ? VendorInvoiceStatus.Paid
          : VendorInvoiceStatus.PartiallyPaid,
      updatedAt: now,
    });
  }

  reverseSettlement(amountMinor: bigint, now: Date): VendorInvoice {
    if (
      this.s.status !== VendorInvoiceStatus.Paid &&
      this.s.status !== VendorInvoiceStatus.PartiallyPaid
    ) {
      throw new IllegalVendorInvoiceTransitionError(
        this.s.id,
        this.s.status,
        VendorInvoiceStatus.Open,
      );
    }
    if (amountMinor <= 0n || amountMinor > this.s.settledMinor)
      throw new InvalidVendorInvoiceError('reversal exceeds what was settled');
    const settled = this.s.settledMinor - amountMinor;
    return new VendorInvoice({
      ...this.s,
      settledMinor: settled,
      balanceMinor: this.s.totalMinor - settled,
      status:
        settled === 0n
          ? VendorInvoiceStatus.Open
          : VendorInvoiceStatus.PartiallyPaid,
      updatedAt: now,
    });
  }

  void(reason: string, now: Date): VendorInvoice {
    if (
      this.s.status !== VendorInvoiceStatus.Draft &&
      this.s.status !== VendorInvoiceStatus.Open
    ) {
      throw new IllegalVendorInvoiceTransitionError(
        this.s.id,
        this.s.status,
        VendorInvoiceStatus.Void,
      );
    }
    const r = reason.trim();
    if (r.length === 0 || r.length > 500)
      throw new InvalidVendorInvoiceError(
        'void reason must be 1..500 characters',
      );
    return new VendorInvoice({
      ...this.s,
      status: VendorInvoiceStatus.Void,
      balanceMinor: 0n,
      voidedAt: now,
      voidReason: r,
      updatedAt: now,
    });
  }
}
