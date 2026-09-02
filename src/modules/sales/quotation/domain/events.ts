/** Outbox events (ADR 0003). Sales gets a LINE ping on each transition. */
export interface QuotationEventBase {
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly occurredAt: Date;
  readonly number: string;
  readonly revision: number;
  readonly customerId: string;
  readonly totalMinor: bigint;
  readonly currency: string;
  /** User id, or "system" for the expiry cron. */
  readonly actor: string;
}

export interface QuotationSentEvent extends QuotationEventBase {
  readonly type: 'quotation.sent.v1';
  readonly validUntil: string;
}

export interface QuotationResolvedEvent extends QuotationEventBase {
  readonly type:
    | 'quotation.accepted.v1'
    | 'quotation.rejected.v1'
    | 'quotation.expired.v1'
    | 'quotation.cancelled.v1';
  readonly reason: string | null;
}

export type QuotationEvent = QuotationSentEvent | QuotationResolvedEvent;
