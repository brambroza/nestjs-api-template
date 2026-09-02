import type { CountStatus, StockCount } from '../../domain';

export const COUNT_REPOSITORY = Symbol('COUNT_REPOSITORY');

export interface CountRepository {
  findById(tenantId: string, id: string): Promise<StockCount | null>;
  list(
    tenantId: string,
    filter: {
      readonly warehouseId?: string | null;
      readonly status?: CountStatus | null;
      readonly limit: number;
      readonly offset: number;
    },
  ): Promise<{ readonly items: readonly StockCount[]; readonly total: number }>;
  create(c: StockCount): Promise<void>;
  /** Optimistic lock on version; returns at version + 1. */
  save(c: StockCount): Promise<StockCount>;
}
