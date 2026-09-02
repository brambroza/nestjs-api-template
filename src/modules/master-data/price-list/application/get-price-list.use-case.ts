import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  PriceListNotFoundError,
  type PriceList,
  type PriceListLine,
} from '../domain';

import {
  PRICE_LIST_REPOSITORY,
  type PriceListRepository,
} from './ports/price-list.repository';

export interface PriceListView {
  readonly list: PriceList;
  readonly lines: readonly PriceListLine[];
}

@Injectable()
export class GetPriceListUseCase {
  constructor(
    @Inject(PRICE_LIST_REPOSITORY) private readonly repo: PriceListRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(id: string): Promise<PriceListView> {
    const tenantId = this.tenant.getTenantId();
    const list = await this.repo.findById(tenantId, id);
    if (!list) throw new PriceListNotFoundError(id);
    const lines = await this.repo.linesOf(tenantId, id);
    return { list, lines };
  }
}
