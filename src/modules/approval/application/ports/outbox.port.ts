import type { ApprovalEvent } from '../../domain';

export const APPROVAL_OUTBOX = Symbol('APPROVAL_OUTBOX');

export interface ApprovalOutboxEnvelope {
  readonly idempotencyKey: string;
  readonly event: ApprovalEvent;
}

/** ADR 0003: a row in the same transaction; delivery is the worker's job. */
export interface ApprovalOutbox {
  enqueue(envelope: ApprovalOutboxEnvelope): Promise<void>;
}
