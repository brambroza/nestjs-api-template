import type { ItemCategory } from '../../domain';

export const ITEM_CATEGORY_REPOSITORY = Symbol('ITEM_CATEGORY_REPOSITORY');

export interface ItemCategoryRepository {
  findById(tenantId: string, id: string): Promise<ItemCategory | null>;
  findByCode(tenantId: string, code: string): Promise<ItemCategory | null>;
  /** Whole catalogue for the tenant — categories are small; the tree is built in memory. */
  listAll(
    tenantId: string,
    opts: { readonly activeOnly: boolean },
  ): Promise<readonly ItemCategory[]>;
  create(category: ItemCategory): Promise<void>;
}
