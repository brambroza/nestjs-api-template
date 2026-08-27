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
  };
});
