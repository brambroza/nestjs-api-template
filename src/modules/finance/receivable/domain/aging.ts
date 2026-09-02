import {
  AGING_BUCKETS,
  AgingBucket,
  agingBucket,
  buildAging as buildSharedAging,
  daysOverdue,
  type IsoDate,
} from '../../../../shared/domain';

export { AGING_BUCKETS, AgingBucket, agingBucket, daysOverdue };

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
  return buildSharedAging(
    invoices.map((i) => ({
      partyId: i.customerId,
      documentId: i.invoiceId,
      number: i.number,
      dueDate: i.dueDate,
      balanceMinor: i.balanceMinor,
    })),
    asOf,
  ).map((r) => ({
    customerId: r.partyId,
    buckets: r.buckets,
    totalMinor: r.totalMinor,
    openInvoices: r.openDocuments,
  }));
}
