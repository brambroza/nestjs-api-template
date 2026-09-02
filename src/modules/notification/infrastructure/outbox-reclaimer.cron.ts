import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { CLOCK, type Clock } from '../../../shared/clock';
import {
  OUTBOX_STORE,
  type OutboxStore,
} from '../application/ports/outbox-store.port';

/**
 * ADR 0003 §2.3 — rescues rows stuck IN_FLIGHT after a worker crash
 * between LINE ack and DB update. Runs every minute; a row leased more
 * than STALLED_TIMEOUT_MS ago goes back to PENDING (attempts unchanged
 * because a stall is not a failure). LINE Retry-Key idempotency means
 * the re-dispatched attempt is deduplicated at LINE's end.
 */
@Injectable()
export class OutboxReclaimerCron {
  private readonly logger = new Logger(OutboxReclaimerCron.name);
  private static readonly STALLED_TIMEOUT_MS = 5 * 60 * 1000;

  constructor(
    @Inject(OUTBOX_STORE) private readonly store: OutboxStore,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    const now = this.clock.now();
    const staleBefore = new Date(
      now.getTime() - OutboxReclaimerCron.STALLED_TIMEOUT_MS,
    );
    try {
      const reclaimed = await this.store.reclaimStalled(staleBefore);
      if (reclaimed > 0) {
        this.logger.warn(
          { reclaimed, staleBefore: staleBefore.toISOString() },
          'outbox reclaimed stalled IN_FLIGHT rows -> PENDING',
        );
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error({ err: reason }, 'outbox reclaimer crashed');
    }
  }
}
