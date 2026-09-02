import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CLOCK, type Clock } from '../../../shared/clock';
import type { LineConfig, OutboxConfig } from '../../../shared/config';
import { nextDelayMs } from '../domain/backoff';

import {
  LINE_MESSAGING,
  type LineMessagingPort,
} from './ports/line-messaging.port';
import {
  OUTBOX_STORE,
  type OutboxRow,
  type OutboxStore,
} from './ports/outbox-store.port';

/**
 * Central dispatcher. On each tick (cron: every OUTBOX_POLL_INTERVAL_MS)
 * it claims a batch of PENDING rows and dispatches. Success -> DELIVERED.
 * Transient failure -> increment attempts, schedule next attempt via the
 * ADR 0003 backoff table, or move to DEAD when the max is reached.
 *
 * Recipient resolution: reads `LINE_RECIPIENT_MAP` tenant -> LINE id.
 * A row whose tenant is not in the map is treated as a **permanent**
 * failure (loud DEAD) rather than being silently sent to a fake id —
 * ops sees the DEAD row and knows to fix the config.
 *
 * Idempotency: every dispatch sends the row's `idempotencyKey` as the
 * LINE `X-Line-Retry-Key`, so a retry after the stalled-timeout reclaim
 * (see OutboxReclaimerCron) tells LINE "same push" and duplicates are
 * dropped at their end.
 */
@Injectable()
export class OutboxDispatcher {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private readonly maxAttempts: number;
  private readonly recipientByTenant: Readonly<Record<string, string>>;
  private readonly batchSize = 25;
  private running = false;

  constructor(
    @Inject(OUTBOX_STORE) private readonly store: OutboxStore,
    @Inject(LINE_MESSAGING) private readonly line: LineMessagingPort,
    @Inject(CLOCK) private readonly clock: Clock,
    config: ConfigService,
  ) {
    this.maxAttempts = config.getOrThrow<OutboxConfig>('outbox').maxAttempts;
    this.recipientByTenant =
      config.getOrThrow<LineConfig>('line').recipientByTenant;
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = this.clock.now();
      const { claimed } = await this.store.claimPending(now, this.batchSize);
      for (const row of claimed) {
        await this.dispatchOne(row);
      }
    } finally {
      this.running = false;
    }
  }

  private async dispatchOne(row: OutboxRow): Promise<void> {
    const recipient = this.recipientByTenant[row.tenantId];
    if (!recipient) {
      await this.store.markFailure(
        row.id,
        row.attempts + 1,
        null,
        `permanent: LINE_RECIPIENT_MAP has no entry for tenant "${row.tenantId}"`,
      );
      this.logger.error(
        { tenantId: row.tenantId, id: row.id },
        'outbox has no LINE recipient for tenant -> DEAD',
      );
      return;
    }

    try {
      const outcome = await this.line.push({
        to: recipient,
        text: renderText(row),
        idempotencyKey: row.idempotencyKey,
      });
      if (outcome.kind === 'sent') {
        await this.store.markDelivered(row.id, this.clock.now());
        return;
      }
      if (outcome.kind === 'permanent') {
        await this.store.markFailure(
          row.id,
          row.attempts + 1,
          null,
          `permanent: ${outcome.reason}`,
        );
        this.logger.warn(
          { id: row.id, reason: outcome.reason },
          'outbox permanent failure -> DEAD',
        );
        return;
      }
      await this.scheduleRetry(row, `transient: ${outcome.reason}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await this.scheduleRetry(row, `exception: ${reason}`);
    }
  }

  private async scheduleRetry(row: OutboxRow, reason: string): Promise<void> {
    const attempts = row.attempts + 1;
    const delayMs = nextDelayMs(attempts, this.maxAttempts);
    const nextAttemptAt =
      delayMs === null ? null : new Date(this.clock.now().getTime() + delayMs);
    await this.store.markFailure(row.id, attempts, nextAttemptAt, reason);
    if (nextAttemptAt === null) {
      this.logger.warn(
        { id: row.id, attempts, reason },
        'outbox exhausted retries -> DEAD',
      );
    }
  }
}

function renderText(row: OutboxRow): string {
  const subject = (row.aggregateType ?? 'production_order').replace(/_/g, ' ');
  return `[${row.eventType}] ${subject} ${row.aggregateId}`;
}
