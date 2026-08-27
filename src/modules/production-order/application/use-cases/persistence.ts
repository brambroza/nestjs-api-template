import type { OutboxPort } from '../ports/outbox.port';
import type { ProductionOrderRepository } from '../ports/production-order.repository';

import type { ProductionOrder } from '../../domain';

import { idempotencyKeyFor } from './idempotency';

/**
 * The invariant that Phase 3's tests care about: save + outbox write happen
 * inside the SAME transaction, driven by the SAME call. The
 * TransactionManager threads the tx handle via CLS; both `repo.save` and
 * `outbox.enqueue` pick it up transparently.
 *
 * Extracted into a helper so every use case that changes state calls the
 * exact same sequence — there is no way to accidentally skip the outbox.
 */
export async function persistAndDispatch(
  order: ProductionOrder,
  repo: ProductionOrderRepository,
  outbox: OutboxPort,
): Promise<void> {
  const events = [...order.pendingEvents];
  await repo.save(order);
  const newVersion = order.version + 1;
  for (const event of events) {
    await outbox.enqueue({
      idempotencyKey: idempotencyKeyFor(event, newVersion),
      event,
    });
  }
  order.clearPendingEvents();
}
