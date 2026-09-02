import type { Item } from '../../domain';

export const ITEM_REPOSITORY = Symbol('ITEM_REPOSITORY');

export interface ListItemsOptions {
  readonly limit: number;
  readonly offset: number;
  readonly activeOnly: boolean;
}

export interface ItemRepository {
  findById(tenantId: string, id: string): Promise<Item | null>;
  findBySku(tenantId: string, sku: string): Promise<Item | null>;
  list(
    tenantId: string,
    opts: ListItemsOptions,
  ): Promise<{ items: readonly Item[]; total: number }>;
  create(item: Item): Promise<void>;
}
