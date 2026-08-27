import { HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { ClsService } from 'nestjs-cls';

import { SegregationOfDutiesError } from '../../modules/production-order/domain/errors';
import {
  OrderId,
  UserId,
} from '../../modules/production-order/domain/value-objects/ids';

import { DomainError } from './domain-error';
import { DomainExceptionFilter } from './domain-exception.filter';
import type { ErrorResponse } from './error-response';

class TestError extends DomainError {
  readonly code = 'PRODUCTION_ORDER.NOT_FOUND';
}

function makeHost(): {
  host: ArgumentsHost;
  status: jest.Mock;
  json: jest.Mock;
} {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'POST', url: '/orders' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

function makeCls(requestId: string): ClsService<{
  requestId: string;
  tenantId: string | null;
  userId: string | null;
}> {
  return {
    isActive: () => true,
    get: (key: string) => (key === 'requestId' ? requestId : null),
  } as unknown as ClsService<{
    requestId: string;
    tenantId: string | null;
    userId: string | null;
  }>;
}

describe('DomainExceptionFilter', () => {
  it('translates a DomainError with a mapped code to the corresponding HTTP status and messageTh', () => {
    const filter = new DomainExceptionFilter(makeCls('req-123'));
    const { host, status, json } = makeHost();

    filter.catch(new TestError('not found'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    const body = json.mock.calls[0][0] as ErrorResponse;
    expect(body.code).toBe('PRODUCTION_ORDER.NOT_FOUND');
    expect(body.messageTh).toBe('ไม่พบใบสั่งผลิตที่ระบุ');
    expect(body.requestId).toBe('req-123');
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('exposes typed domain-error fields via `details`', () => {
    const filter = new DomainExceptionFilter(makeCls('req-abc'));
    const { host, json } = makeHost();

    const err = new SegregationOfDutiesError(
      OrderId.of('ord-1'),
      UserId.of('alice'),
    );
    filter.catch(err, host);

    const body = json.mock.calls[0][0] as ErrorResponse;
    expect(body.code).toBe('PRODUCTION_ORDER.SEGREGATION_OF_DUTIES');
    expect(body.details).toEqual({ orderId: 'ord-1', actor: 'alice' });
  });

  it('passes HttpException through with the same status and envelope', () => {
    const filter = new DomainExceptionFilter(makeCls('req-x'));
    const { host, status, json } = makeHost();

    filter.catch(
      new BadRequestException({ field: 'name', reason: 'required' }),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0] as ErrorResponse;
    expect(body.code).toBe('HTTP.BAD_REQUEST');
    expect(body.details).toEqual({ field: 'name', reason: 'required' });
  });

  it('maps 5xx HttpException to HTTP.INTERNAL code', () => {
    const filter = new DomainExceptionFilter(makeCls('r'));
    const { host, json } = makeHost();

    filter.catch(
      new HttpException('boom', HttpStatus.INTERNAL_SERVER_ERROR),
      host,
    );

    const body = json.mock.calls[0][0] as ErrorResponse;
    expect(body.code).toBe('HTTP.INTERNAL');
  });

  it('translates an unknown throwable to INTERNAL.UNHANDLED / 500', () => {
    const filter = new DomainExceptionFilter(makeCls('r'));
    const { host, status, json } = makeHost();

    filter.catch(new Error('kaboom'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const body = json.mock.calls[0][0] as ErrorResponse;
    expect(body.code).toBe('INTERNAL.UNHANDLED');
  });
});
