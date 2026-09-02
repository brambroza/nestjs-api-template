import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  DuplicateItemCategoryCodeError,
  ItemCategory,
  ItemCategoryNotFoundError,
} from '../domain';

import {
  ITEM_CATEGORY_REPOSITORY,
  type ItemCategoryRepository,
} from './ports/item-category.repository';

export interface CreateItemCategoryInput {
  readonly code: string;
  readonly name: string;
  readonly parentId?: string | null;
}

@Injectable()
export class CreateItemCategoryUseCase {
  constructor(
    @Inject(ITEM_CATEGORY_REPOSITORY)
    private readonly repo: ItemCategoryRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateItemCategoryInput): Promise<ItemCategory> {
    const tenantId = this.tenant.getTenantId();
    const parentId = (input.parentId ?? '').trim() || null;
    const [existing, parent] = await Promise.all([
      this.repo.findByCode(tenantId, input.code.trim()),
      parentId === null ? null : this.repo.findById(tenantId, parentId),
    ]);
    if (existing) {
      throw new DuplicateItemCategoryCodeError(input.code);
    }
    if (parentId !== null && (!parent || !parent.snapshot().isActive)) {
      throw new ItemCategoryNotFoundError(parentId);
    }
    const category = ItemCategory.create({
      id: randomUUID(),
      tenantId,
      code: input.code,
      name: input.name,
      parent: parent ? parent.snapshot() : null,
      now: this.clock.now(),
    });
    await this.repo.create(category);
    return category;
  }
}
