import { registerAs } from '@nestjs/config';

import { validateEnv } from './env.schema';

/**
 * Config namespace: `app.*`. Access via
 *   configService.getOrThrow<AppConfig>('app')
 * and never reach for `process.env` outside this folder.
 */
export interface AppConfig {
  readonly env: 'development' | 'test' | 'staging' | 'production';
  readonly name: string;
  readonly port: number;
  readonly requestTimeoutMs: number;
  readonly shutdownGraceMs: number;
  readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  readonly apiPrefix: string;
  readonly bodyLimit: string;
  readonly slowRequestMs: number;
  /** Parsed CORS origins. `['*']` = allow-all. `[]` = disallow. */
  readonly corsOrigins: readonly string[];
  readonly rateLimit: {
    readonly ttlMs: number;
    readonly requests: number;
  };
}

function parseCorsOrigins(raw: string): string[] {
  if (raw.length === 0) return [];
  if (raw === '*') return ['*'];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export default registerAs<AppConfig>('app', () => {
  const env = validateEnv(process.env);
  return {
    env: env.APP_ENV,
    name: env.APP_NAME,
    port: env.PORT,
    requestTimeoutMs: env.REQUEST_TIMEOUT_MS,
    shutdownGraceMs: env.SHUTDOWN_GRACE_MS,
    logLevel: env.LOG_LEVEL,
    apiPrefix: env.API_PREFIX,
    bodyLimit: env.BODY_LIMIT,
    slowRequestMs: env.SLOW_REQUEST_MS,
    corsOrigins: parseCorsOrigins(env.CORS_ORIGINS),
    rateLimit: {
      ttlMs: env.RATE_LIMIT_TTL_MS,
      requests: env.RATE_LIMIT_REQUESTS,
    },
  };
});
