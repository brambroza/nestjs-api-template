import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import { ItemCategory, ItemCategoryNotFoundError } from '../domain';

import {
  ITEM_CATEGORY_REPOSITORY,
  type ItemCategoryRepository,
} from './ports/item-category.repository';

@Injectable()
export class GetItemCategoryUseCase {
  constructor(
    @Inject(ITEM_CATEGORY_REPOSITORY)
    private readonly repo: ItemCategoryRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(id: string): Promise<ItemCategory> {
    const found = await this.repo.findById(this.tenant.getTenantId(), id);
    if (!found) throw new ItemCategoryNotFoundError(id);
    return found;
  }
}
