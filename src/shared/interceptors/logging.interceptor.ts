import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import type { AppConfig } from '../config/app.config';

/**
 * One-line access log per request: method, path, status, duration.
 * pino-http already logs a "request completed" line; this one is
 * pinned to the Nest pipeline and picks up route-resolved paths
 * ("/orders/:id" not "/orders/abc123") for easier grouping. Requests
 * over `app.slowRequestMs` are logged at warn instead of info so
 * dashboards can alert on them.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('http');
  private readonly slowMs: number;

  constructor(config: ConfigService) {
    this.slowMs = config.getOrThrow<AppConfig>('app').slowRequestMs;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context
      .switchToHttp()
      .getRequest<{ method: string; url: string; route?: { path?: string } }>();
    const res = context.switchToHttp().getResponse<{ statusCode: number }>();
    const start = Date.now();
    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - start;
          const path = req.route?.path ?? req.url;
          const line = `${req.method} ${path} -> ${String(res.statusCode)} ${durationMs}ms`;
          if (durationMs >= this.slowMs) {
            this.logger.warn(`${line} SLOW (>=${String(this.slowMs)}ms)`);
          } else {
            this.logger.log(line);
          }
        },
        error: (err: unknown) => {
          const durationMs = Date.now() - start;
          const path = req.route?.path ?? req.url;
          const status = res.statusCode || 500;
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `${req.method} ${path} -> ${String(status)} ${durationMs}ms ${message}`,
          );
        },
      }),
    );
  }
}
