import { createHash } from 'node:crypto';

import type { ProductionOrderEvent } from '../../domain';

/**
 * ADR 0003 idempotency key: sha256(event_type + aggregate_id + version).
 * Version is the post-write version of the aggregate — the identifier of
 * the *specific* transition that produced this event. Two retries of the
 * same use case that failed before commit generate different keys
 * (nothing was written); a retry after successful commit is not possible
 * because the tx already succeeded.
 */
export function idempotencyKeyFor(
  event: ProductionOrderEvent,
  postWriteVersion: number,
): string {
  return createHash('sha256')
    .update(`${event.type}|${event.aggregateId}|${String(postWriteVersion)}`)
    .digest('hex');
}
