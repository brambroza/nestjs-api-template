export interface GlEvent {
  readonly type: 'journal_entry.posted.v1' | 'journal_entry.reversed.v1';
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly occurredAt: Date;
  readonly companyId: string;
  readonly number: string;
  readonly entryDate: string;
  readonly sourceType: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly actor: string;
}
