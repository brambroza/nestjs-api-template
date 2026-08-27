import { registerAs } from '@nestjs/config';

import { validateEnv } from './env.schema';

export interface OutboxConfig {
  readonly pollIntervalMs: number;
  readonly maxAttempts: number;
}

export default registerAs<OutboxConfig>('outbox', () => {
  const env = validateEnv(process.env);
  return {
    pollIntervalMs: env.OUTBOX_POLL_INTERVAL_MS,
    maxAttempts: env.OUTBOX_MAX_ATTEMPTS,
  };
});
