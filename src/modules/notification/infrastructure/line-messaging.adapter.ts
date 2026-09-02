import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { request } from 'undici';

import type { LineConfig } from '../../../shared/config';
import type {
  LineMessagingPort,
  LinePushOutcome,
  LinePushRequest,
} from '../application/ports/line-messaging.port';

/**
 * Real LINE Messaging API adapter. Forwards `idempotencyKey` as
 * `X-Line-Retry-Key` so LINE deduplicates a retry against the previous
 * (possibly-succeeded) attempt — this is what makes the outbox
 * "effectively exactly-once" across worker crashes (ADR 0003 §2.2.4).
 *
 * 4xx (except 429) are permanent — bad credentials or bad payload
 * won't get better with retry. 429/5xx and network errors are
 * transient and the dispatcher backs off per the schedule.
 */
@Injectable()
export class LineMessagingAdapter implements LineMessagingPort {
  private readonly logger = new Logger(LineMessagingAdapter.name);
  private readonly baseUrl: string;
  private readonly channelAccessToken: string;

  constructor(config: ConfigService) {
    const line = config.getOrThrow<LineConfig>('line');
    this.baseUrl = line.apiBaseUrl;
    this.channelAccessToken = line.channelAccessToken;
  }

  async push(req: LinePushRequest): Promise<LinePushOutcome> {
    try {
      const { statusCode, body } = await request(
        `${this.baseUrl}/v2/bot/message/push`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.channelAccessToken}`,
            'x-line-retry-key': req.idempotencyKey,
          },
          body: JSON.stringify({
            to: req.to,
            messages: [{ type: 'text', text: req.text }],
          }),
        },
      );
      // Drain the body to release the connection back to the pool.
      const text = await body.text();
      if (statusCode >= 200 && statusCode < 300) {
        return { kind: 'sent' };
      }
      if (statusCode === 429 || statusCode >= 500) {
        return {
          kind: 'transient',
          status: statusCode,
          reason: `LINE HTTP ${String(statusCode)}: ${text.slice(0, 200)}`,
        };
      }
      return {
        kind: 'permanent',
        status: statusCode,
        reason: `LINE HTTP ${String(statusCode)}: ${text.slice(0, 200)}`,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn({ reason }, 'LINE push network error');
      return { kind: 'transient', reason };
    }
  }
}
