import { Money, isIsoDate, type IsoDate } from '../../../../shared/domain';

import {
  IllegalJournalTransitionError,
  InvalidJournalEntryError,
  UnbalancedJournalEntryError,
} from './errors';

export const JournalEntryStatus = {
  Draft: 'DRAFT',
  PendingApproval: 'PENDING_APPROVAL',
  Posted: 'POSTED',
  Reversed: 'REVERSED',
  Void: 'VOID',
} as const;
export type JournalEntryStatus =
  (typeof JournalEntryStatus)[keyof typeof JournalEntryStatus];
export function isJournalEntryStatus(v: string): v is JournalEntryStatus {
  return (Object.values(JournalEntryStatus) as string[]).includes(v);
}

/** Statuses whose lines count towards balances. */
export const POSTED_STATUSES: readonly JournalEntryStatus[] = [
  'POSTED',
  'REVERSED',
];

export const JournalSourceType = {
  Manual: 'MANUAL',
  ArInvoice: 'AR_INVOICE',
  ArReceipt: 'AR_RECEIPT',
  ApInvoice: 'AP_INVOICE',
  ApPayment: 'AP_PAYMENT',
  Inventory: 'INVENTORY',
  YearEndClose: 'YEAR_END_CLOSE',
} as const;
export type JournalSourceType =
  (typeof JournalSourceType)[keyof typeof JournalSourceType];
export function isJournalSourceType(v: string): v is JournalSourceType {
  return (Object.values(JournalSourceType) as string[]).includes(v);
}

export const MAX_JOURNAL_LINES = 500;
export const MAX_DESCRIPTION = 500;

export interface JournalLineInput {
  readonly accountId: string;
  readonly accountCode: string;
  readonly debitMinor: bigint;
  readonly creditMinor: bigint;
  readonly description?: string | null;
  readonly partyType?: string | null;
  readonly partyId?: string | null;
}

export interface JournalLineSnapshot {
  readonly id: string;
  readonly lineNo: number;
  readonly accountId: string;
  readonly accountCode: string;
  readonly debitMinor: bigint;
  readonly creditMinor: bigint;
  readonly description: string | null;
  readonly partyType: string | null;
  readonly partyId: string | null;
}

export interface JournalEntrySnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly number: string;
  readonly entryDate: IsoDate;
  readonly description: string;
  readonly sourceType: JournalSourceType;
  readonly sourceId: string | null;
  readonly sourceKey: string | null;
  readonly currency: string;
  readonly status: JournalEntryStatus;
  readonly reversalOfId: string | null;
  readonly reversedById: string | null;
  readonly approvalRequestId: string | null;
  readonly totalDebitMinor: bigint;
  readonly totalCreditMinor: bigint;
  readonly version: number;
  readonly createdBy: string;
  readonly postedAt: Date | null;
  readonly postedBy: string | null;
  readonly voidedAt: Date | null;
  readonly lines: readonly JournalLineSnapshot[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateJournalEntryProps {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly number: string;
  readonly entryDate: IsoDate;
  readonly description: string;
  readonly sourceType: JournalSourceType;
  readonly sourceId?: string | null;
  readonly sourceKey?: string | null;
  readonly currency: string;
  readonly reversalOfId?: string | null;
  readonly createdBy: string;
  readonly lines: readonly JournalLineInput[];
  /** Line ids, one per input line. */
  readonly lineIds: readonly string[];
  readonly now: Date;
}

export interface LineTotals {
  readonly totalDebitMinor: bigint;
  readonly totalCreditMinor: bigint;
}

/** Every line is exactly one-sided and positive; the entry balances. */
export function validateJournalLines(
  lines: readonly JournalLineInput[],
): LineTotals {
  if (lines.length < 2)
    throw new InvalidJournalEntryError(
      'a journal entry needs at least 2 lines',
    );
  if (lines.length > MAX_JOURNAL_LINES)
    throw new InvalidJournalEntryError(
      `a journal entry has at most ${String(MAX_JOURNAL_LINES)} lines`,
    );
  let debit = 0n;
  let credit = 0n;
  for (const l of lines) {
    if (l.debitMinor < 0n || l.creditMinor < 0n)
      throw new InvalidJournalEntryError(
        `account ${l.accountCode}: amounts must be >= 0`,
      );
    if (l.debitMinor > 0n === l.creditMinor > 0n)
      throw new InvalidJournalEntryError(
        `account ${l.accountCode}: a line is either a debit or a credit`,
      );
    if ((l.description ?? '').length > 200)
      throw new InvalidJournalEntryError(
        `account ${l.accountCode}: description must be <= 200 characters`,
      );
    debit += l.debitMinor;
    credit += l.creditMinor;
  }
  if (debit !== credit) throw new UnbalancedJournalEntryError(debit, credit);
  return { totalDebitMinor: debit, totalCreditMinor: credit };
}

function transition(
  s: JournalEntrySnapshot,
  allowed: readonly JournalEntryStatus[],
  to: JournalEntryStatus,
): void {
  if (!allowed.includes(s.status))
    throw new IllegalJournalTransitionError(s.id, s.status, to);
}

/**
 * Journal entry (T-350). Automatic postings from the sub-ledgers are
 * created and posted in one step; manual JVs go DRAFT → (PENDING_APPROVAL)
 * → POSTED. A posted entry is never edited or deleted: it is REVERSED by a
 * mirror entry (T-350 audit rule).
 */
export class JournalEntry {
  private constructor(private readonly s: JournalEntrySnapshot) {}

  static create(props: CreateJournalEntryProps): JournalEntry {
    const currency = Money.zero(props.currency).currency;
    if (!isIsoDate(props.entryDate))
      throw new InvalidJournalEntryError('entryDate must be YYYY-MM-DD');
    const description = props.description.trim();
    if (description.length === 0)
      throw new InvalidJournalEntryError('description is required');
    if (description.length > MAX_DESCRIPTION)
      throw new InvalidJournalEntryError(
        `description must be <= ${String(MAX_DESCRIPTION)} characters`,
      );
    if (props.lineIds.length !== props.lines.length)
      throw new InvalidJournalEntryError('one line id per line');
    const totals = validateJournalLines(props.lines);
    const lines: JournalLineSnapshot[] = props.lines.map((l, i) => ({
      id: props.lineIds[i] ?? '',
      lineNo: i + 1,
      accountId: l.accountId,
      accountCode: l.accountCode,
      debitMinor: l.debitMinor,
      creditMinor: l.creditMinor,
      description: (l.description ?? '').trim() || null,
      partyType: l.partyType ?? null,
      partyId: l.partyId ?? null,
    }));
    return new JournalEntry({
      id: props.id,
      tenantId: props.tenantId,
      companyId: props.companyId,
      number: props.number,
      entryDate: props.entryDate,
      description,
      sourceType: props.sourceType,
      sourceId: props.sourceId ?? null,
      sourceKey: props.sourceKey ?? null,
      currency,
      status: JournalEntryStatus.Draft,
      reversalOfId: props.reversalOfId ?? null,
      reversedById: null,
      approvalRequestId: null,
      totalDebitMinor: totals.totalDebitMinor,
      totalCreditMinor: totals.totalCreditMinor,
      version: 0,
      createdBy: props.createdBy,
      postedAt: null,
      postedBy: null,
      voidedAt: null,
      lines,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static hydrate(s: JournalEntrySnapshot): JournalEntry {
    return new JournalEntry(s);
  }

  snapshot(): JournalEntrySnapshot {
    return this.s;
  }
  get id(): string {
    return this.s.id;
  }
  get status(): JournalEntryStatus {
    return this.s.status;
  }
  get version(): number {
    return this.s.version;
  }
  get isPosted(): boolean {
    return POSTED_STATUSES.includes(this.s.status);
  }

  submit(approvalRequestId: string, now: Date): JournalEntry {
    transition(this.s, ['DRAFT'], 'PENDING_APPROVAL');
    return new JournalEntry({
      ...this.s,
      status: JournalEntryStatus.PendingApproval,
      approvalRequestId,
      updatedAt: now,
    });
  }

  /** Approval rejected: back to DRAFT so the accountant can fix and resubmit. */
  reopen(now: Date): JournalEntry {
    transition(this.s, ['PENDING_APPROVAL'], 'DRAFT');
    return new JournalEntry({
      ...this.s,
      status: JournalEntryStatus.Draft,
      updatedAt: now,
    });
  }

  post(by: string, now: Date): JournalEntry {
    transition(this.s, ['DRAFT', 'PENDING_APPROVAL'], 'POSTED');
    return new JournalEntry({
      ...this.s,
      status: JournalEntryStatus.Posted,
      postedAt: now,
      postedBy: by,
      updatedAt: now,
    });
  }

  markReversed(reversalId: string, now: Date): JournalEntry {
    transition(this.s, ['POSTED'], 'REVERSED');
    return new JournalEntry({
      ...this.s,
      status: JournalEntryStatus.Reversed,
      reversedById: reversalId,
      updatedAt: now,
    });
  }

  void(now: Date): JournalEntry {
    transition(this.s, ['DRAFT', 'PENDING_APPROVAL'], 'VOID');
    return new JournalEntry({
      ...this.s,
      status: JournalEntryStatus.Void,
      voidedAt: now,
      updatedAt: now,
    });
  }

  /** Mirror lines (debits become credits) for the reversing entry. */
  reversalLines(): JournalLineInput[] {
    return this.s.lines.map((l) => ({
      accountId: l.accountId,
      accountCode: l.accountCode,
      debitMinor: l.creditMinor,
      creditMinor: l.debitMinor,
      description: l.description,
      partyType: l.partyType,
      partyId: l.partyId,
    }));
  }
}
