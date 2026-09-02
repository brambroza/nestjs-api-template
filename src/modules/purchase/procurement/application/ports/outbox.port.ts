import type { PurchaseEvent } from '../../domain';

export const PURCHASE_OUTBOX = Symbol('PURCHASE_OUTBOX');

export interface PurchaseOutboxEnvelope {
  readonly idempotencyKey: string;
  readonly event: PurchaseEvent;
}

/** ADR 0003: a row in the same transaction; delivery is the worker's job. */
export interface PurchaseOutbox {
  enqueue(envelope: PurchaseOutboxEnvelope): Promise<void>;
}
