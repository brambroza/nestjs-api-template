import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import { Item, ItemNotFoundError } from '../domain';

import { ITEM_REPOSITORY, type ItemRepository } from './ports/item.repository';

@Injectable()
export class GetItemUseCase {
  constructor(
    @Inject(ITEM_REPOSITORY) private readonly repo: ItemRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(id: string): Promise<Item> {
    const found = await this.repo.findById(this.tenant.getTenantId(), id);
    if (!found) {
      throw new ItemNotFoundError(id);
    }
    return found;
  }
}
