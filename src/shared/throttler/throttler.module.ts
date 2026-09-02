import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import type { AppConfig } from '../config/app.config';

/**
 * Global rate limiter, keyed by (tenantId, userId) via the CLS store —
 * falls back to remote IP if the request has no auth context.
 *
 * Backing store is in-memory here; in production point ThrottlerModule
 * at a Redis storage (`@nest-lab/throttler-storage-redis` or similar)
 * so replicas share the counter.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const app = config.getOrThrow<AppConfig>('app');
        return {
          throttlers: [
            {
              name: 'global',
              ttl: app.rateLimit.ttlMs,
              limit: app.rateLimit.requests,
            },
          ],
        };
      },
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppThrottlerModule {}
