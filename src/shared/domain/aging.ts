import { fromIsoDate, type IsoDate } from './iso-date';

/** Days-past-due buckets shared by AR (customers) and AP (vendors). */
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
  return Math.floor(
    (fromIsoDate(asOf).getTime() - fromIsoDate(dueDate).getTime()) / 86_400_000,
  );
}

export function agingBucket(days: number): AgingBucket {
  if (days <= 0) return AgingBucket.Current;
  if (days <= 30) return AgingBucket.D1To30;
  if (days <= 60) return AgingBucket.D31To60;
  if (days <= 90) return AgingBucket.D61To90;
  return AgingBucket.Over90;
}

export interface AgingInput {
  readonly partyId: string;
  readonly documentId: string;
  readonly number: string | null;
  readonly dueDate: IsoDate;
  readonly balanceMinor: bigint;
}

export interface AgingRow {
  readonly partyId: string;
  readonly buckets: Readonly<Record<AgingBucket, bigint>>;
  readonly totalMinor: bigint;
  readonly openDocuments: number;
}

export function buildAging(
  docs: readonly AgingInput[],
  asOf: IsoDate,
): AgingRow[] {
  const rows = new Map<
    string,
    { buckets: Record<AgingBucket, bigint>; total: bigint; count: number }
  >();
  for (const d of docs) {
    if (d.balanceMinor <= 0n) continue;
    const row = rows.get(d.partyId) ?? {
      buckets: { CURRENT: 0n, D1_30: 0n, D31_60: 0n, D61_90: 0n, OVER_90: 0n },
      total: 0n,
      count: 0,
    };
    row.buckets[agingBucket(daysOverdue(d.dueDate, asOf))] += d.balanceMinor;
    row.total += d.balanceMinor;
    row.count += 1;
    rows.set(d.partyId, row);
  }
  return [...rows.entries()]
    .map(([partyId, r]) => ({
      partyId,
      buckets: r.buckets,
      totalMinor: r.total,
      openDocuments: r.count,
    }))
    .sort((a, b) =>
      a.totalMinor > b.totalMinor ? -1 : a.totalMinor < b.totalMinor ? 1 : 0,
    );
}
