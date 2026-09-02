import { ClassSerializerInterceptor, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, Reflector } from '@nestjs/core';

import { MasterDataModule } from './modules/master-data/master-data.module';
import { NotificationModule } from './modules/notification/notification.module';
import { ProductionOrderModule } from './modules/production-order/production-order.module';
import { AuthModule } from './shared/auth';
import { AppClsModule } from './shared/cls';
import { ClockModule } from './shared/clock';
import { AppConfigModule } from './shared/config';
import { DatabaseModule } from './shared/database';
import { DomainExceptionFilter } from './shared/errors';
import { HealthModule } from './shared/health';
import { IdempotencyModule } from './shared/idempotency/idempotency.module';
import { LoggingInterceptor, TimeoutInterceptor } from './shared/interceptors';
import { AppLoggerModule } from './shared/logging';
import { AppThrottlerModule } from './shared/throttler/throttler.module';
import { GlobalValidationModule } from './shared/validation/validation.module';

@Module({
  imports: [
    AppConfigModule,
    AppClsModule,
    ClockModule,
    AppLoggerModule,
    DatabaseModule,
    AuthModule,
    AppThrottlerModule,
    IdempotencyModule,
    GlobalValidationModule,
    HealthModule,
    ProductionOrderModule,
    MasterDataModule,
    NotificationModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    {
      provide: APP_INTERCEPTOR,
      inject: [Reflector],
      useFactory: (reflector: Reflector) =>
        new ClassSerializerInterceptor(reflector, {
          excludeExtraneousValues: true,
          strategy: 'excludeAll',
        }),
    },
  ],
})
export class AppModule {}
