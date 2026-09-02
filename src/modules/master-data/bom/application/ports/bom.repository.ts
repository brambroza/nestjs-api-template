import type { Bom } from '../../domain';

export const BOM_REPOSITORY = Symbol('BOM_REPOSITORY');

export interface BomRepository {
  findById(tenantId: string, id: string): Promise<Bom | null>;
  findActiveForItem(tenantId: string, itemId: string): Promise<Bom | null>;
  /** All versions for the item, newest version first. */
  listForItem(tenantId: string, itemId: string): Promise<readonly Bom[]>;
  create(bom: Bom): Promise<void>;
  /** Header-only update (activation flag); components are immutable per version. */
  save(bom: Bom): Promise<void>;
}
