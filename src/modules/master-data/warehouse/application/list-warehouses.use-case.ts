import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import type { Warehouse } from '../domain';

import {
  WAREHOUSE_REPOSITORY,
  type WarehouseRepository,
} from './ports/warehouse.repository';

export interface ListWarehousesInput {
  readonly limit?: number;
  readonly offset?: number;
  readonly activeOnly?: boolean;
  readonly branchId?: string | null;
}

export interface ListWarehousesResult {
  readonly items: readonly Warehouse[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

@Injectable()
export class ListWarehousesUseCase {
  private static readonly DEFAULT_LIMIT = 50;
  private static readonly MAX_LIMIT = 200;

  constructor(
    @Inject(WAREHOUSE_REPOSITORY) private readonly repo: WarehouseRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(
    input: ListWarehousesInput = {},
  ): Promise<ListWarehousesResult> {
    const limit = clampInt(
      input.limit ?? ListWarehousesUseCase.DEFAULT_LIMIT,
      1,
      ListWarehousesUseCase.MAX_LIMIT,
    );
    const offset = clampInt(input.offset ?? 0, 0, Number.MAX_SAFE_INTEGER);
    const { items, total } = await this.repo.list(this.tenant.getTenantId(), {
      limit,
      offset,
      activeOnly: input.activeOnly ?? true,
      branchId: input.branchId ?? null,
    });
    return { items, total, limit, offset };
  }
}

function clampInt(v: number, lo: number, hi: number): number {
  const n = Math.trunc(Number.isFinite(v) ? v : 0);
  return Math.max(lo, Math.min(hi, n));
}
