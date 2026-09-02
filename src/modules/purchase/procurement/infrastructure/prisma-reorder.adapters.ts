import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import type { ReorderRuleSnapshot } from '../domain';
import type {
  ReorderRuleRepository,
  StockAvailabilityLookup,
} from '../application/ports/reorder.ports';

@Injectable()
export class PrismaReorderRuleRepository implements ReorderRuleRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findByKey(tenantId: string, warehouseId: string, itemId: string) {
    return this.txm
      .getClient()
      .reorderRule.findFirst({ where: { tenantId, warehouseId, itemId } });
  }

  async list(tenantId: string, warehouseId: string | null) {
    return this.txm.getClient().reorderRule.findMany({
      where: { tenantId, ...(warehouseId ? { warehouseId } : {}) },
      orderBy: [{ warehouseId: 'asc' }, { itemId: 'asc' }],
    });
  }

  async upsert(rule: ReorderRuleSnapshot): Promise<void> {
    await this.txm.getClient().reorderRule.upsert({
      where: {
        tenantId_warehouseId_itemId: {
          tenantId: rule.tenantId,
          warehouseId: rule.warehouseId,
          itemId: rule.itemId,
        },
      },
      create: rule,
      update: {
        reorderPoint: rule.reorderPoint,
        reorderQty: rule.reorderQty,
        preferredVendorId: rule.preferredVendorId,
        isActive: rule.isActive,
      },
    });
  }

  async markTriggered(id: string, at: Date): Promise<void> {
    await this.txm
      .getClient()
      .reorderRule.update({ where: { id }, data: { lastTriggeredAt: at } });
  }

  async tenantsWithActiveRules(): Promise<readonly string[]> {
    const rows = await this.txm.getClient().reorderRule.findMany({
      where: { isActive: true },
      distinct: ['tenantId'],
      select: { tenantId: true },
    });
    return rows.map((r) => r.tenantId);
  }
}

/** Σ (onHand − reserved) over the lot balances of one item in one warehouse. */
@Injectable()
export class PrismaStockAvailabilityLookup implements StockAvailabilityLookup {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async availableQty(
    tenantId: string,
    warehouseId: string,
    itemId: string,
  ): Promise<bigint> {
    const agg = await this.txm.getClient().stockBalance.aggregate({
      where: { tenantId, warehouseId, itemId },
      _sum: { onHandQty: true, reservedQty: true },
    });
    return (agg._sum.onHandQty ?? 0n) - (agg._sum.reservedQty ?? 0n);
  }
}
