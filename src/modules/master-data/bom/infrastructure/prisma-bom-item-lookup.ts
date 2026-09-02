import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import type {
  BomItemLookup,
  BomItemRef,
} from '../application/ports/bom-item-lookup.port';

const select = { id: true, sku: true, defaultUomCode: true, isActive: true };

@Injectable()
export class PrismaBomItemLookup implements BomItemLookup {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findById(tenantId: string, itemId: string): Promise<BomItemRef | null> {
    return this.txm
      .getClient()
      .item.findFirst({ where: { tenantId, id: itemId }, select });
  }

  async findByIds(
    tenantId: string,
    itemIds: readonly string[],
  ): Promise<ReadonlyMap<string, BomItemRef>> {
    if (itemIds.length === 0) return new Map();
    const rows = await this.txm.getClient().item.findMany({
      where: { tenantId, id: { in: [...itemIds] } },
      select,
    });
    return new Map(rows.map((r) => [r.id, r]));
  }
}
