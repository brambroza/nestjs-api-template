import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { ClsService } from 'nestjs-cls';

import type { AppConfig } from '../config/app.config';
import type { AppClsStore } from '../cls/app-cls-store';

/**
 * nestjs-pino with:
 *   - JSON output in non-dev
 *   - pretty output in dev
 *   - CLS mixin so every log line carries requestId/tenantId/userId
 *   - redact for common PII/secret fields
 *
 * The Logger is used as Nest's global logger (`app.useLogger(logger)`
 * in main.ts), so `Logger.log(...)` and `console.log(...)` alike route
 * through pino.
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService, ClsService],
      useFactory: (config: ConfigService, cls: ClsService<AppClsStore>) => {
        const app = config.getOrThrow<AppConfig>('app');
        const isDev = app.env === 'development';
        return {
          pinoHttp: {
            level: app.logLevel,
            base: { app: app.name, env: app.env },
            transport: isDev
              ? {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                    translateTime: 'HH:MM:ss.l',
                    ignore: 'pid,hostname,req,res,responseTime',
                  },
                }
              : undefined,
            mixin: () => {
              if (!cls.isActive()) return {};
              return {
                requestId: cls.get('requestId'),
                tenantId: cls.get('tenantId'),
                userId: cls.get('userId'),
              };
            },
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers["x-line-signature"]',
                '*.password',
                '*.passwordHash',
                '*.token',
                '*.accessToken',
                '*.refreshToken',
                '*.secret',
                '*.jwtSecret',
                '*.channelSecret',
                '*.channelAccessToken',
                '*.creditCard',
              ],
              censor: '[REDACTED]',
            },
            serializers: {
              req: (req: { id?: string; method?: string; url?: string }) => ({
                id: req.id,
                method: req.method,
                url: req.url,
              }),
            },
          },
        };
      },
    }),
  ],
  exports: [LoggerModule],
})
export class AppLoggerModule {}
