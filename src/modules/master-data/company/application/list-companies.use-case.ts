import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import type { Company } from '../domain';

import {
  COMPANY_REPOSITORY,
  type CompanyRepository,
} from './ports/company.repository';

export interface ListCompaniesInput {
  readonly limit?: number;
  readonly offset?: number;
  readonly activeOnly?: boolean;
}

export interface ListCompaniesResult {
  readonly items: readonly Company[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

@Injectable()
export class ListCompaniesUseCase {
  private static readonly DEFAULT_LIMIT = 50;
  private static readonly MAX_LIMIT = 200;

  constructor(
    @Inject(COMPANY_REPOSITORY) private readonly repo: CompanyRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(input: ListCompaniesInput = {}): Promise<ListCompaniesResult> {
    const limit = clampInt(
      input.limit ?? ListCompaniesUseCase.DEFAULT_LIMIT,
      1,
      ListCompaniesUseCase.MAX_LIMIT,
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
