import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { IdempotencyMiddleware } from './idempotency.middleware';

@Module({
  providers: [IdempotencyMiddleware],
})
export class IdempotencyModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Applied globally — the middleware itself decides which methods matter.
    consumer.apply(IdempotencyMiddleware).forRoutes('*');
  }
}
