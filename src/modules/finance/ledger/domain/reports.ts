import type { IsoDate } from '../../../../shared/domain';

import type { JournalLineInput } from './journal-entry';

export type LedgerAccountType =
  'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export interface AccountInfo {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly nameTh: string | null;
  readonly type: LedgerAccountType;
  readonly isPostable: boolean;
  readonly isActive: boolean;
}

/** Sum of posted lines for one account over some date range. */
export interface AccountSum {
  readonly accountId: string;
  readonly debitMinor: bigint;
  readonly creditMinor: bigint;
}

/** Balance in the account's natural sign (debit-normal +, credit-normal +). */
export function naturalBalance(
  type: LedgerAccountType,
  debitMinor: bigint,
  creditMinor: bigint,
): bigint {
  return type === 'ASSET' || type === 'EXPENSE'
    ? debitMinor - creditMinor
    : creditMinor - debitMinor;
}

function index(sums: readonly AccountSum[]): Map<string, AccountSum> {
  const m = new Map<string, AccountSum>();
  for (const s of sums) {
    const prev = m.get(s.accountId);
    m.set(
      s.accountId,
      prev
        ? {
            accountId: s.accountId,
            debitMinor: prev.debitMinor + s.debitMinor,
            creditMinor: prev.creditMinor + s.creditMinor,
          }
        : s,
    );
  }
  return m;
}

const ZERO: AccountSum = { accountId: '', debitMinor: 0n, creditMinor: 0n };

function byCode(a: AccountInfo, b: AccountInfo): number {
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

// ---- Trial balance (T-353) --------------------------------------------------

export interface TrialBalanceRow {
  readonly accountId: string;
  readonly code: string;
  readonly name: string;
  readonly nameTh: string | null;
  readonly type: LedgerAccountType;
  /** Opening balance, debit-positive (credit balances are negative). */
  readonly openingMinor: bigint;
  readonly debitMinor: bigint;
  readonly creditMinor: bigint;
  /** Closing balance, debit-positive. */
  readonly closingMinor: bigint;
}

export interface TrialBalance {
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly rows: readonly TrialBalanceRow[];
  readonly totalDebitMinor: bigint;
  readonly totalCreditMinor: bigint;
  readonly totalClosingDebitMinor: bigint;
  readonly totalClosingCreditMinor: bigint;
  readonly balanced: boolean;
}

export function buildTrialBalance(
  from: IsoDate,
  to: IsoDate,
  accounts: readonly AccountInfo[],
  opening: readonly AccountSum[],
  period: readonly AccountSum[],
): TrialBalance {
  const open = index(opening);
  const mov = index(period);
  const rows: TrialBalanceRow[] = [];
  let totalDebit = 0n;
  let totalCredit = 0n;
  let closingDr = 0n;
  let closingCr = 0n;
  for (const a of [...accounts].sort(byCode)) {
    if (!a.isPostable) continue;
    const o = open.get(a.id) ?? ZERO;
    const m = mov.get(a.id) ?? ZERO;
    const openingMinor = o.debitMinor - o.creditMinor;
    const closingMinor = openingMinor + m.debitMinor - m.creditMinor;
    if (
      openingMinor === 0n &&
      m.debitMinor === 0n &&
      m.creditMinor === 0n &&
      closingMinor === 0n
    )
      continue;
    rows.push({
      accountId: a.id,
      code: a.code,
      name: a.name,
      nameTh: a.nameTh,
      type: a.type,
      openingMinor,
      debitMinor: m.debitMinor,
      creditMinor: m.creditMinor,
      closingMinor,
    });
    totalDebit += m.debitMinor;
    totalCredit += m.creditMinor;
    if (closingMinor > 0n) closingDr += closingMinor;
    else closingCr += -closingMinor;
  }
  return {
    from,
    to,
    rows,
    totalDebitMinor: totalDebit,
    totalCreditMinor: totalCredit,
    totalClosingDebitMinor: closingDr,
    totalClosingCreditMinor: closingCr,
    balanced: totalDebit === totalCredit && closingDr === closingCr,
  };
}

// ---- Profit and loss (T-354) ------------------------------------------------

export interface StatementRow {
  readonly accountId: string;
  readonly code: string;
  readonly name: string;
  readonly nameTh: string | null;
  readonly amountMinor: bigint;
}
export interface StatementSection {
  readonly rows: readonly StatementRow[];
  readonly totalMinor: bigint;
}

function section(
  accounts: readonly AccountInfo[],
  sums: Map<string, AccountSum>,
  type: LedgerAccountType,
): StatementSection {
  const rows: StatementRow[] = [];
  let total = 0n;
  for (const a of [...accounts].sort(byCode)) {
    if (a.type !== type || !a.isPostable) continue;
    const s = sums.get(a.id);
    if (!s) continue;
    const amountMinor = naturalBalance(type, s.debitMinor, s.creditMinor);
    if (amountMinor === 0n) continue;
    rows.push({
      accountId: a.id,
      code: a.code,
      name: a.name,
      nameTh: a.nameTh,
      amountMinor,
    });
    total += amountMinor;
  }
  return { rows, totalMinor: total };
}

export interface ProfitAndLoss {
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly revenue: StatementSection;
  readonly expenses: StatementSection;
  readonly netProfitMinor: bigint;
}

export function buildProfitAndLoss(
  from: IsoDate,
  to: IsoDate,
  accounts: readonly AccountInfo[],
  period: readonly AccountSum[],
): ProfitAndLoss {
  const sums = index(period);
  const revenue = section(accounts, sums, 'REVENUE');
  const expenses = section(accounts, sums, 'EXPENSE');
  return {
    from,
    to,
    revenue,
    expenses,
    netProfitMinor: revenue.totalMinor - expenses.totalMinor,
  };
}

// ---- Balance sheet (T-355) --------------------------------------------------

export interface BalanceSheet {
  readonly asOf: IsoDate;
  readonly assets: StatementSection;
  readonly liabilities: StatementSection;
  readonly equity: StatementSection;
  /** Profit not yet closed to retained earnings (P&L accounts as at). */
  readonly currentEarningsMinor: bigint;
  readonly totalAssetsMinor: bigint;
  readonly totalLiabilitiesAndEquityMinor: bigint;
  readonly balanced: boolean;
}

export function buildBalanceSheet(
  asOf: IsoDate,
  accounts: readonly AccountInfo[],
  cumulative: readonly AccountSum[],
): BalanceSheet {
  const sums = index(cumulative);
  const assets = section(accounts, sums, 'ASSET');
  const liabilities = section(accounts, sums, 'LIABILITY');
  const equity = section(accounts, sums, 'EQUITY');
  const currentEarningsMinor =
    section(accounts, sums, 'REVENUE').totalMinor -
    section(accounts, sums, 'EXPENSE').totalMinor;
  const totalLE =
    liabilities.totalMinor + equity.totalMinor + currentEarningsMinor;
  return {
    asOf,
    assets,
    liabilities,
    equity,
    currentEarningsMinor,
    totalAssetsMinor: assets.totalMinor,
    totalLiabilitiesAndEquityMinor: totalLE,
    balanced: assets.totalMinor === totalLE,
  };
}

// ---- Year-end close (T-352) -------------------------------------------------

/**
 * Lines that zero every P&L account and move the net result to retained
 * earnings. Empty when there is nothing to close.
 */
export function buildClosingLines(
  accounts: readonly AccountInfo[],
  cumulative: readonly AccountSum[],
  retainedEarnings: {
    readonly accountId: string;
    readonly accountCode: string;
  },
): JournalLineInput[] {
  const sums = index(cumulative);
  const lines: JournalLineInput[] = [];
  let net = 0n; // credit-positive
  for (const a of [...accounts].sort(byCode)) {
    if (a.type !== 'REVENUE' && a.type !== 'EXPENSE') continue;
    const s = sums.get(a.id);
    if (!s) continue;
    const balance = s.debitMinor - s.creditMinor; // debit-positive
    if (balance === 0n) continue;
    lines.push({
      accountId: a.id,
      accountCode: a.code,
      debitMinor: balance < 0n ? -balance : 0n,
      creditMinor: balance > 0n ? balance : 0n,
      description: 'Year-end close',
    });
    net -= balance;
  }
  if (lines.length === 0) return [];
  lines.push({
    accountId: retainedEarnings.accountId,
    accountCode: retainedEarnings.accountCode,
    debitMinor: net < 0n ? -net : 0n,
    creditMinor: net > 0n ? net : 0n,
    description: 'Year-end close: net result to retained earnings',
  });
  return lines;
}
