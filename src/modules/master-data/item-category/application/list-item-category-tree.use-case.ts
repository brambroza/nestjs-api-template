import { Inject, Injectable } from '@nestjs/common';

import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import { buildCategoryTree, type CategoryTreeNode } from '../domain';

import {
  ITEM_CATEGORY_REPOSITORY,
  type ItemCategoryRepository,
} from './ports/item-category.repository';

@Injectable()
export class ListItemCategoryTreeUseCase {
  constructor(
    @Inject(ITEM_CATEGORY_REPOSITORY)
    private readonly repo: ItemCategoryRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(
    input: { readonly activeOnly?: boolean } = {},
  ): Promise<readonly CategoryTreeNode[]> {
    const all = await this.repo.listAll(this.tenant.getTenantId(), {
      activeOnly: input.activeOnly ?? true,
    });
    return buildCategoryTree(all.map((c) => c.snapshot()));
  }
}
