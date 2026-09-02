import type { UomDefinition } from '../../domain';

export const UOM_REPOSITORY = Symbol('UOM_REPOSITORY');

export interface ListUomsOptions {
  readonly limit: number;
  readonly offset: number;
}

export interface UomRepository {
  findById(tenantId: string, id: string): Promise<UomDefinition | null>;
  findByCode(tenantId: string, code: string): Promise<UomDefinition | null>;
  list(
    tenantId: string,
    opts: ListUomsOptions,
  ): Promise<{ items: readonly UomDefinition[]; total: number }>;
  create(uom: UomDefinition): Promise<void>;
}
