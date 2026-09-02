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
 * `reclaimStalled` runs from a separate cron to recover rows stuck in
 * IN_FLIGHT after a worker crash between LINE ack and DB update
 * (ADR 0003 §2.3 stalled-timeout re-lease).
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

  /**
   * Move IN_FLIGHT rows whose lease is older than `staleBefore` back to
   * PENDING (attempts unchanged) so the poller re-picks them.
   * Returns how many were reclaimed for logging/metrics.
   */
  reclaimStalled(staleBefore: Date): Promise<number>;
}
