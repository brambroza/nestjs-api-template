import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import type { Branch } from '../domain';

import {
  BRANCH_REPOSITORY,
  type BranchRepository,
} from './ports/branch.repository';

export interface ListBranchesInput {
  readonly limit?: number;
  readonly offset?: number;
  readonly activeOnly?: boolean;
  readonly companyId?: string | null;
}

export interface ListBranchesResult {
  readonly items: readonly Branch[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

@Injectable()
export class ListBranchesUseCase {
  private static readonly DEFAULT_LIMIT = 50;
  private static readonly MAX_LIMIT = 200;

  constructor(
    @Inject(BRANCH_REPOSITORY) private readonly repo: BranchRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(input: ListBranchesInput = {}): Promise<ListBranchesResult> {
    const limit = clampInt(
      input.limit ?? ListBranchesUseCase.DEFAULT_LIMIT,
      1,
      ListBranchesUseCase.MAX_LIMIT,
    );
    const offset = clampInt(input.offset ?? 0, 0, Number.MAX_SAFE_INTEGER);
    const { items, total } = await this.repo.list(this.tenant.getTenantId(), {
      limit,
      offset,
      activeOnly: input.activeOnly ?? true,
      companyId: input.companyId ?? null,
    });
    return { items, total, limit, offset };
  }
}

function clampInt(v: number, lo: number, hi: number): number {
  const n = Math.trunc(Number.isFinite(v) ? v : 0);
  return Math.max(lo, Math.min(hi, n));
}
