import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  DuplicateItemSkuError,
  InvalidItemFieldError,
  Item,
  type TrackingPolicy,
} from '../domain';

import {
  CATEGORY_LOOKUP,
  type CategoryLookup,
} from './ports/category-lookup.port';
import { ITEM_REPOSITORY, type ItemRepository } from './ports/item.repository';
import {
  UOM_CATALOG_LOOKUP,
  type UomCatalogLookup,
} from './ports/uom-catalog.port';

export interface CreateItemInput {
  readonly sku: string;
  readonly name: string;
  readonly description?: string | null;
  readonly defaultUomCode: string;
  readonly categoryId?: string | null;
  readonly trackingPolicy?: TrackingPolicy;
  readonly shelfLifeDays?: number | null;
}

@Injectable()
export class CreateItemUseCase {
  constructor(
    @Inject(ITEM_REPOSITORY) private readonly repo: ItemRepository,
    @Inject(UOM_CATALOG_LOOKUP) private readonly uom: UomCatalogLookup,
    @Inject(CATEGORY_LOOKUP) private readonly categories: CategoryLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateItemInput): Promise<Item> {
    const tenantId = this.tenant.getTenantId();
    const categoryId = (input.categoryId ?? '').trim() || null;
    const [existing, uomExists, categoryExists] = await Promise.all([
      this.repo.findBySku(tenantId, input.sku.trim()),
      this.uom.exists(tenantId, input.defaultUomCode.trim()),
      categoryId === null
        ? Promise.resolve(true)
        : this.categories.exists(tenantId, categoryId),
    ]);
    if (existing) {
      throw new DuplicateItemSkuError(input.sku);
    }
    if (!uomExists) {
      throw new InvalidItemFieldError(
        `defaultUomCode "${input.defaultUomCode}" is not a known UoM in this tenant`,
      );
    }
    if (!categoryExists) {
      throw new InvalidItemFieldError(
        `categoryId "${String(categoryId)}" is not a known category in this tenant`,
      );
    }
    const item = Item.create({
      id: randomUUID(),
      tenantId,
      sku: input.sku,
      name: input.name,
      description: input.description ?? null,
      defaultUomCode: input.defaultUomCode,
      categoryId,
      trackingPolicy: input.trackingPolicy,
      shelfLifeDays: input.shelfLifeDays ?? null,
      now: this.clock.now(),
    });
    await this.repo.create(item);
    return item;
  }
}
