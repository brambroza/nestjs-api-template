import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import appConfig from './app.config';
import authConfig from './auth.config';
import databaseConfig from './database.config';
import financeConfig from './finance.config';
import lineConfig from './line.config';
import outboxConfig from './outbox.config';
import redisConfig from './redis.config';
import tenantDefaultsConfig from './tenant-defaults.config';
import { validateEnv } from './env.schema';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      load: [
        appConfig,
        databaseConfig,
        redisConfig,
        authConfig,
        lineConfig,
        outboxConfig,
        tenantDefaultsConfig,
        financeConfig,
      ],
    }),
  ],
  exports: [ConfigModule],
})
export class AppConfigModule {}
