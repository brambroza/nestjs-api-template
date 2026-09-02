import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { OutboxDispatcher } from '../application/outbox-dispatcher.service';

/**
 * Cron-driven poller. Every 5 seconds it asks the dispatcher to claim
 * a batch of PENDING rows and deliver them. The dispatcher owns
 * per-tick reentrancy (a running tick prevents another from starting),
 * so a slow LINE call cannot stack ticks.
 *
 * Poll interval is intentionally a constant here — real production
 * pods usually run several replicas and each polls independently. The
 * DB-side updateMany lease keeps them from stepping on each other.
 */
@Injectable()
export class OutboxWorkerCron {
  private readonly logger = new Logger(OutboxWorkerCron.name);

  constructor(private readonly dispatcher: OutboxDispatcher) {}

  @Cron('*/5 * * * * *')
  async tick(): Promise<void> {
    try {
      await this.dispatcher.tick();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error({ err: reason }, 'outbox tick crashed');
    }
  }
}
