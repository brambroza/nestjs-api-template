import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import type { Item } from '../domain';

import { ITEM_REPOSITORY, type ItemRepository } from './ports/item.repository';

export interface ListItemsInput {
  readonly limit?: number;
  readonly offset?: number;
  readonly activeOnly?: boolean;
}

export interface ListItemsResult {
  readonly items: readonly Item[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

@Injectable()
export class ListItemsUseCase {
  private static readonly DEFAULT_LIMIT = 50;
  private static readonly MAX_LIMIT = 200;

  constructor(
    @Inject(ITEM_REPOSITORY) private readonly repo: ItemRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(input: ListItemsInput = {}): Promise<ListItemsResult> {
    const limit = clampInt(
      input.limit ?? ListItemsUseCase.DEFAULT_LIMIT,
      1,
      ListItemsUseCase.MAX_LIMIT,
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
