import { z } from 'zod';

/**
 * The one and only place that inspects `process.env`. Every other file
 * receives typed configuration via `ConfigService.getOrThrow(...)` on a
 * namespaced accessor. If a required variable is missing, boot fails
 * loudly at start-up naming the exact field, so mis-provisioned
 * containers crash on start instead of at 3 AM.
 */

export const AppEnv = z.enum(['development', 'test', 'staging', 'production']);

const nonEmpty = z.string().trim().min(1);

/** Env values arrive as strings. Coerce → int → default. */
const intFromString = (defaultValue: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, 'expected an integer')
    .transform((s) => Number.parseInt(s, 10))
    .default(defaultValue);

const bigintFromString = (defaultValue: bigint) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, 'expected an integer')
    .transform((s) => BigInt(s))
    .default(defaultValue);

export const EnvSchema = z.object({
  APP_ENV: AppEnv.default('development'),
  APP_NAME: nonEmpty.default('nestjs-api-template'),
  PORT: intFromString(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  REQUEST_TIMEOUT_MS: intFromString(15_000),

  DATABASE_URL: nonEmpty,
  REDIS_URL: nonEmpty,

  JWT_SECRET: nonEmpty.min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_ISSUER: nonEmpty.default('nestjs-api-template'),
  JWT_AUDIENCE: nonEmpty.default('nestjs-api-template'),

  LINE_CHANNEL_ACCESS_TOKEN: nonEmpty,
  LINE_CHANNEL_SECRET: nonEmpty,
  LINE_API_BASE_URL: nonEmpty.default('https://api.line.me'),
  /**
   * Comma-separated tenant→recipient map: `tenant-a=Uxxxxx,tenant-b=Cxxxxx`.
   * Each right-hand side is a LINE user id (starts with U) or group id
   * (starts with C). If empty, the outbox worker refuses to boot in
   * production so we never DEAD-letter every message silently.
   */
  LINE_RECIPIENT_MAP: z.string().trim().default(''),

  DEFAULT_DUAL_APPROVAL_THRESHOLD_SATANG: bigintFromString(50_000_000n),
  DEFAULT_OVER_TOLERANCE_BASIS_POINTS: bigintFromString(500n),
  DEFAULT_UNDER_TOLERANCE_BASIS_POINTS: bigintFromString(0n),

  OUTBOX_POLL_INTERVAL_MS: intFromString(5_000),
  OUTBOX_MAX_ATTEMPTS: intFromString(7),

  SHUTDOWN_GRACE_MS: intFromString(20_000),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Called by ConfigModule.forRoot({ validate }) at boot.
 * Returning the parsed object (not the raw record) makes every field
 * strongly typed and pre-defaulted downstream.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
