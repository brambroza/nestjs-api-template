import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import type { UomDefinition } from '../domain';

import { UOM_REPOSITORY, type UomRepository } from './ports/uom.repository';

export interface ListUomsInput {
  readonly limit?: number;
  readonly offset?: number;
}

export interface ListUomsResult {
  readonly items: readonly UomDefinition[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

@Injectable()
export class ListUomsUseCase {
  private static readonly DEFAULT_LIMIT = 50;
  private static readonly MAX_LIMIT = 200;

  constructor(
    @Inject(UOM_REPOSITORY) private readonly repo: UomRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(input: ListUomsInput = {}): Promise<ListUomsResult> {
    const limit = clampInt(
      input.limit ?? ListUomsUseCase.DEFAULT_LIMIT,
      1,
      ListUomsUseCase.MAX_LIMIT,
    );
    const offset = clampInt(input.offset ?? 0, 0, Number.MAX_SAFE_INTEGER);
    const { items, total } = await this.repo.list(this.tenant.getTenantId(), {
      limit,
      offset,
    });
    return { items, total, limit, offset };
  }
}

function clampInt(v: number, lo: number, hi: number): number {
  const n = Math.trunc(Number.isFinite(v) ? v : 0);
  return Math.max(lo, Math.min(hi, n));
}
