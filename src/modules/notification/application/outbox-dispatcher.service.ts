import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CLOCK, type Clock } from '../../../shared/clock';
import type { OutboxConfig } from '../../../shared/config';
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
 * it claims a batch of PENDING rows, moves them to IN_FLIGHT via
 * optimistic update, and dispatches. Success -> DELIVERED. Transient
 * failure -> increment attempts, schedule next attempt via the ADR
 * 0003 backoff table, or move to DEAD when the max is reached.
 *
 * Idempotency: every dispatch sends the row's `idempotencyKey` as the
 * LINE `X-Line-Retry-Key`, so a mid-flight process crash that leaves a
 * row IN_FLIGHT for the stalled-timeout re-lease sends LINE the same
 * key on the retry — LINE treats it as the same push and does not
 * duplicate.
 */
@Injectable()
export class OutboxDispatcher {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private readonly maxAttempts: number;
  private readonly batchSize = 25;
  private running = false;

  constructor(
    @Inject(OUTBOX_STORE) private readonly store: OutboxStore,
    @Inject(LINE_MESSAGING) private readonly line: LineMessagingPort,
    @Inject(CLOCK) private readonly clock: Clock,
    config: ConfigService,
  ) {
    this.maxAttempts = config.getOrThrow<OutboxConfig>('outbox').maxAttempts;
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
    try {
      const outcome = await this.line.push({
        to: extractRecipient(row),
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
          null, // permanent = DEAD immediately, no more retries
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

/**
 * Render helpers stay small and text-only for the template. Real users
 * hook a template engine here — the domain event already carries every
 * datum needed.
 */
function extractRecipient(row: OutboxRow): string {
  // Production sends to a LINE user id or a group id. The template's
  // seed inserts a placeholder recipient per tenant so nothing panics
  // when the worker actually fires.
  return `line:tenant/${row.tenantId}`;
}

function renderText(row: OutboxRow): string {
  return `[${row.eventType}] order ${row.aggregateId}`;
}
