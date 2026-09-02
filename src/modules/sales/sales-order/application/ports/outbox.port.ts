import type { SalesOrderEvent } from '../../domain';

export const SALES_ORDER_OUTBOX = Symbol('SALES_ORDER_OUTBOX');

export interface SalesOrderOutboxEnvelope {
  readonly idempotencyKey: string;
  readonly event: SalesOrderEvent;
}

/** ADR 0003: a row in the same transaction; delivery is the worker's job. */
export interface SalesOrderOutbox {
  enqueue(envelope: SalesOrderOutboxEnvelope): Promise<void>;
}
