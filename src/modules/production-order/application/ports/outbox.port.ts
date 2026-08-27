import type { ProductionOrderEvent } from '../../domain';

export const OUTBOX = Symbol('OUTBOX');

export interface OutboxEnvelope {
  readonly idempotencyKey: string;
  readonly event: ProductionOrderEvent;
}

/**
 * ADR 0003. `enqueue` writes a row inside the current transaction —
 * that is the whole point. There is no `send`, no HTTP, no queue
 * push here. The worker (Phase 4) is what drives delivery.
 */
export interface OutboxPort {
  enqueue(envelope: OutboxEnvelope): Promise<void>;
}
