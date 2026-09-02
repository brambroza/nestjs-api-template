import type { Warehouse } from '../../domain';

export const WAREHOUSE_REPOSITORY = Symbol('WAREHOUSE_REPOSITORY');

export interface ListWarehousesOptions {
  readonly limit: number;
  readonly offset: number;
  readonly activeOnly: boolean;
  readonly branchId: string | null;
}

export interface WarehouseRepository {
  findById(tenantId: string, id: string): Promise<Warehouse | null>;
  findByCode(tenantId: string, code: string): Promise<Warehouse | null>;
  findDefaultForBranch(
    tenantId: string,
    branchId: string,
  ): Promise<Warehouse | null>;
  list(
    tenantId: string,
    opts: ListWarehousesOptions,
  ): Promise<{ items: readonly Warehouse[]; total: number }>;
  create(warehouse: Warehouse): Promise<void>;
}
