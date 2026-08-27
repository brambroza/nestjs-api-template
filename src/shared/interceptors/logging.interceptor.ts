import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * One-line access log per request: method, path, status, duration.
 * pino-http already logs a "request completed" line; this one is
 * pinned to the Nest pipeline and picks up route-resolved paths (so
 * "/orders/:id" not "/orders/abc123") for easier grouping in logs.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('http');

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
          this.logger.log(
            `${req.method} ${path} -> ${String(res.statusCode)} ${durationMs}ms`,
          );
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
