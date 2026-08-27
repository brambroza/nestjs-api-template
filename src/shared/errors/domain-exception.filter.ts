import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import type { AppClsStore } from '../cls/app-cls-store';

import { DomainError } from './domain-error';
import type { ErrorResponse } from './error-response';
import { messageThForCode } from './messages-th';
import { httpStatusForCode } from './status-code-map';

/**
 * Catches DomainError from any layer and translates it to the standard
 * ErrorResponse shape. Domain code stays HTTP-free; the transport
 * concern lives here in one place.
 *
 * HttpException raised by validation pipes / auth guards passes through
 * a separate branch so those keep their existing details (field-level
 * validation errors, WWW-Authenticate headers, etc.) but still land in
 * the same response envelope.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  constructor(private readonly cls: ClsService<AppClsStore>) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{
      status(code: number): { json(body: ErrorResponse): void };
    }>();

    const requestId = this.cls.isActive() ? this.cls.get('requestId') : '';
    const timestamp = new Date().toISOString();

    if (exception instanceof DomainError) {
      const status: number = httpStatusForCode(exception.code);
      const body: ErrorResponse = {
        code: exception.code,
        message: exception.message,
        messageTh: messageThForCode(exception.code),
        details: extractDomainDetails(exception),
        requestId,
        timestamp,
      };
      if (status >= 500) {
        this.logger.error({ err: exception, status }, exception.message);
      } else {
        this.logger.warn({ code: exception.code, status }, exception.message);
      }
      response.status(status).json(body);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const body: ErrorResponse = {
        code: httpExceptionCode(status),
        message: typeof payload === 'string' ? payload : exception.message,
        messageTh: messageThForCode(httpExceptionCode(status)),
        details:
          typeof payload === 'object'
            ? (payload as Record<string, unknown>)
            : undefined,
        requestId,
        timestamp,
      };
      response.status(status).json(body);
      return;
    }

    const err =
      exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error({ err }, 'unhandled exception');
    const body: ErrorResponse = {
      code: 'INTERNAL.UNHANDLED',
      message: 'Internal server error',
      messageTh: 'เกิดข้อผิดพลาดที่ไม่คาดคิด',
      requestId,
      timestamp,
    };
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }
}

function extractDomainDetails(err: DomainError): Record<string, unknown> {
  const asRecord = err as unknown as Record<string, unknown>;
  const details: Record<string, unknown> = {};
  for (const key of Object.keys(asRecord)) {
    if (
      key === 'code' ||
      key === 'name' ||
      key === 'stack' ||
      key === 'message'
    ) {
      continue;
    }
    details[key] = asRecord[key];
  }
  return details;
}

const HTTP_STATUS_CODES: Readonly<Record<number, string>> = {
  400: 'HTTP.BAD_REQUEST',
  401: 'HTTP.UNAUTHORIZED',
  403: 'HTTP.FORBIDDEN',
  404: 'HTTP.NOT_FOUND',
  409: 'HTTP.CONFLICT',
  422: 'HTTP.UNPROCESSABLE_ENTITY',
  428: 'HTTP.PRECONDITION_REQUIRED',
  429: 'HTTP.TOO_MANY_REQUESTS',
};

function httpExceptionCode(status: number): string {
  const named = HTTP_STATUS_CODES[status];
  if (named) return named;
  return status >= 500 ? 'HTTP.INTERNAL' : 'HTTP.CLIENT_ERROR';
}
