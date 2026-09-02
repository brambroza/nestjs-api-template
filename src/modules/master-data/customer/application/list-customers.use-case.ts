import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import type { Customer } from '../domain';

import {
  CUSTOMER_REPOSITORY,
  type CustomerRepository,
} from './ports/customer.repository';

export interface ListCustomersInput {
  readonly limit?: number;
  readonly offset?: number;
  readonly activeOnly?: boolean;
}

export interface ListCustomersResult {
  readonly items: readonly Customer[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

/**
 * Bounded pagination — an unbounded `limit=1000000` from a caller
 * would drag the request thread and DB. Caller-supplied values are
 * clamped, not rejected, so a naive UI still works.
 */
@Injectable()
export class ListCustomersUseCase {
  private static readonly DEFAULT_LIMIT = 50;
  private static readonly MAX_LIMIT = 200;

  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly repo: CustomerRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(input: ListCustomersInput = {}): Promise<ListCustomersResult> {
    const limit = clampInt(
      input.limit ?? ListCustomersUseCase.DEFAULT_LIMIT,
      1,
      ListCustomersUseCase.MAX_LIMIT,
    );
    const offset = clampInt(input.offset ?? 0, 0, Number.MAX_SAFE_INTEGER);
    const activeOnly = input.activeOnly ?? true;
    const { items, total } = await this.repo.list(this.tenant.getTenantId(), {
      limit,
      offset,
      activeOnly,
    });
    return { items, total, limit, offset };
  }
}

function clampInt(v: number, lo: number, hi: number): number {
  const n = Math.trunc(Number.isFinite(v) ? v : 0);
  return Math.max(lo, Math.min(hi, n));
}
