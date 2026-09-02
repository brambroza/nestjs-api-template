import { fromIsoDate, type IsoDate } from '../../../../shared/domain';

export const AgingBucket = {
  Current: 'CURRENT',
  D1To30: 'D1_30',
  D31To60: 'D31_60',
  D61To90: 'D61_90',
  Over90: 'OVER_90',
} as const;
export type AgingBucket = (typeof AgingBucket)[keyof typeof AgingBucket];
export const AGING_BUCKETS: readonly AgingBucket[] = [
  'CURRENT',
  'D1_30',
  'D31_60',
  'D61_90',
  'OVER_90',
];

export function daysOverdue(dueDate: IsoDate, asOf: IsoDate): number {
  const ms = fromIsoDate(asOf).getTime() - fromIsoDate(dueDate).getTime();
  return Math.floor(ms / 86_400_000);
}

export function agingBucket(days: number): AgingBucket {
  if (days <= 0) return AgingBucket.Current;
  if (days <= 30) return AgingBucket.D1To30;
  if (days <= 60) return AgingBucket.D31To60;
  if (days <= 90) return AgingBucket.D61To90;
  return AgingBucket.Over90;
}

export interface AgingInput {
  readonly customerId: string;
  readonly invoiceId: string;
  readonly number: string | null;
  readonly dueDate: IsoDate;
  readonly balanceMinor: bigint;
}

export interface AgingRow {
  readonly customerId: string;
  readonly buckets: Readonly<Record<AgingBucket, bigint>>;
  readonly totalMinor: bigint;
  readonly openInvoices: number;
}

/** T-335: per-customer buckets 0-30 / 31-60 / 61-90 / 90+ by days past due. */
export function buildAging(
  invoices: readonly AgingInput[],
  asOf: IsoDate,
): AgingRow[] {
  const rows = new Map<
    string,
    { buckets: Record<AgingBucket, bigint>; total: bigint; count: number }
  >();
  for (const inv of invoices) {
    if (inv.balanceMinor <= 0n) continue;
    const row = rows.get(inv.customerId) ?? {
      buckets: { CURRENT: 0n, D1_30: 0n, D31_60: 0n, D61_90: 0n, OVER_90: 0n },
      total: 0n,
      count: 0,
    };
    const bucket = agingBucket(daysOverdue(inv.dueDate, asOf));
    row.buckets[bucket] += inv.balanceMinor;
    row.total += inv.balanceMinor;
    row.count += 1;
    rows.set(inv.customerId, row);
  }
  return [...rows.entries()]
    .map(([customerId, r]) => ({
      customerId,
      buckets: r.buckets,
      totalMinor: r.total,
      openInvoices: r.count,
    }))
    .sort((a, b) =>
      a.totalMinor > b.totalMinor ? -1 : a.totalMinor < b.totalMinor ? 1 : 0,
    );
}
