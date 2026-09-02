import type { OutboxStatus } from '../../domain/outbox-status';

export const OUTBOX_STORE = Symbol('OUTBOX_STORE');

export interface OutboxRow {
  readonly id: string;
  readonly tenantId: string;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly payload: string;
  readonly idempotencyKey: string;
  readonly attempts: number;
  readonly status: OutboxStatus;
}

export interface ClaimResult {
  readonly claimed: readonly OutboxRow[];
}

/**
 * Abstract DB access. The dispatcher only needs three atomic ops.
 */
export interface OutboxStore {
  /** Move up to `limit` PENDING rows whose nextAttemptAt <= now into
   *  IN_FLIGHT and return them. */
  claimPending(now: Date, limit: number): Promise<ClaimResult>;

  markDelivered(id: string, deliveredAt: Date): Promise<void>;

  markFailure(
    id: string,
    attemptNumber: number,
    nextAttemptAt: Date | null,
    lastError: string,
  ): Promise<void>;
}
