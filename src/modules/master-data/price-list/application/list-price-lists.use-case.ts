import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import type { PriceList } from '../domain';

import {
  PRICE_LIST_REPOSITORY,
  type PriceListRepository,
} from './ports/price-list.repository';

export interface ListPriceListsInput {
  readonly limit?: number;
  readonly offset?: number;
  readonly customerId?: string | null;
  readonly activeOnly?: boolean;
}

export interface ListPriceListsResult {
  readonly items: readonly PriceList[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

@Injectable()
export class ListPriceListsUseCase {
  private static readonly DEFAULT_LIMIT = 50;
  private static readonly MAX_LIMIT = 200;

  constructor(
    @Inject(PRICE_LIST_REPOSITORY) private readonly repo: PriceListRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(
    input: ListPriceListsInput = {},
  ): Promise<ListPriceListsResult> {
    const limit = Math.max(
      1,
      Math.min(
        ListPriceListsUseCase.MAX_LIMIT,
        Math.trunc(input.limit ?? ListPriceListsUseCase.DEFAULT_LIMIT),
      ),
    );
    const offset = Math.max(0, Math.trunc(input.offset ?? 0));
    const { items, total } = await this.repo.list(this.tenant.getTenantId(), {
      limit,
      offset,
      customerId: input.customerId,
      activeOnly: input.activeOnly ?? true,
    });
    return { items, total, limit, offset };
  }
}
