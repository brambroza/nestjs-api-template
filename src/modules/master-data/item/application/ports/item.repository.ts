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
  /** Bulk existence check for import; matching follows DB collation (case-insensitive on MSSQL). */
  findBySkus(
    tenantId: string,
    skus: readonly string[],
  ): Promise<readonly Item[]>;
  list(
    tenantId: string,
    opts: ListItemsOptions,
  ): Promise<{ items: readonly Item[]; total: number }>;
  create(item: Item): Promise<void>;
  /** Chunked insert; participates in the ambient transaction. */
  createMany(items: readonly Item[]): Promise<void>;
}
