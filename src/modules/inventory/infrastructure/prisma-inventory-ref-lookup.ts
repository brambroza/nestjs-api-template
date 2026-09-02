import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../shared/database';
import { CostingMethod, isCostingMethod } from '../domain';
import type {
  InventoryRefLookup,
  ItemRef,
} from '../application/ports/inventory-ref-lookup.port';

const ITEM_SELECT = {
  id: true,
  sku: true,
  name: true,
  defaultUomCode: true,
  trackingPolicy: true,
  shelfLifeDays: true,
  isActive: true,
} as const;

/** Direct reads of master-data tables (lookup-port pattern). */
@Injectable()
export class PrismaInventoryRefLookup implements InventoryRefLookup {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findItem(tenantId: string, itemId: string): Promise<ItemRef | null> {
    return this.txm
      .getClient()
      .item.findFirst({ where: { tenantId, id: itemId }, select: ITEM_SELECT });
  }

  async findItemBySku(tenantId: string, sku: string): Promise<ItemRef | null> {
    return this.txm
      .getClient()
      .item.findFirst({ where: { tenantId, sku }, select: ITEM_SELECT });
  }

  async warehouseExists(
    tenantId: string,
    warehouseId: string,
  ): Promise<boolean> {
    const row = await this.txm.getClient().warehouse.findFirst({
      where: { tenantId, id: warehouseId, isActive: true },
      select: { id: true },
    });
    return row !== null;
  }

  async findDefaultWarehouse(
    tenantId: string,
    companyId: string | null,
  ): Promise<string | null> {
    const row = await this.txm.getClient().warehouse.findFirst({
      where: {
        tenantId,
        isDefault: true,
        isActive: true,
        ...(companyId ? { branch: { companyId } } : {}),
      },
      orderBy: [{ branch: { isHeadOffice: 'desc' } }, { code: 'asc' }],
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async costingMethod(tenantId: string): Promise<CostingMethod> {
    const t = await this.txm.getClient().tenant.findFirst({
      where: { id: tenantId },
      select: { costingMethod: true },
    });
    return t && isCostingMethod(t.costingMethod)
      ? t.costingMethod
      : CostingMethod.Fifo;
  }
}
