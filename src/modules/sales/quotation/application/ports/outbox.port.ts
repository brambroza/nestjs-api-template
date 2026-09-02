import type { QuotationEvent } from '../../domain';

export const QUOTATION_OUTBOX = Symbol('QUOTATION_OUTBOX');

export interface QuotationOutboxEnvelope {
  readonly idempotencyKey: string;
  readonly event: QuotationEvent;
}

/** ADR 0003: a row in the same transaction; delivery is the worker's job. */
export interface QuotationOutbox {
  enqueue(envelope: QuotationOutboxEnvelope): Promise<void>;
}
