import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import type { AppClsStore } from '../../../../shared/cls';
import { PrismaTransactionManager } from '../../../../shared/database';
import { type BomLine, OrderId, Quantity, Sku } from '../../domain';
import type { BomLookupPort } from '../../application/ports/bom-lookup.port';

type BomClient = Pick<
  Prisma.TransactionClient,
  'bomLine' | 'productionOrder' | 'bom'
>;

/**
 * T-125. Resolution order:
 *   1. `bom_line` rows attached to the order — a frozen per-order
 *      snapshot (override, or history for orders released before the
 *      master BOM existed). If any exist they win outright.
 *   2. Otherwise the ACTIVE master-data BOM for the order's productSku.
 *   3. Otherwise no components (release proceeds with nothing to reserve).
 *
 * Reads md_bom / md_bom_component through Prisma only — no import of
 * master-data code, so the module boundary stays one-way.
 */
@Injectable()
export class PrismaBomLookup implements BomLookupPort {
  constructor(
    private readonly tx: PrismaTransactionManager,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async findByOrderId(orderId: OrderId): Promise<readonly BomLine[]> {
    const client = this.tx.getClient() as unknown as BomClient;
    const tenantId = this.cls.get('tenantId');
    if (!tenantId) return [];

    const frozen = await client.bomLine.findMany({
      where: { productionOrderId: orderId, tenantId },
    });
    if (frozen.length > 0) {
      return frozen.map((r) => ({
        sku: Sku.of(r.sku),
        requiredPerUnit: Quantity.of(
          r.requiredPerUnitValue,
          r.requiredPerUnitUom,
        ),
        scrapBasisPoints: r.scrapBasisPoints,
        yieldBasisPoints: r.yieldBasisPoints,
        minPack: Quantity.of(r.minPackValue, r.minPackUom),
      }));
    }

    const order = await client.productionOrder.findFirst({
      where: { id: orderId, tenantId },
      select: { productSku: true },
    });
    if (!order?.productSku) return [];

    const master = await client.bom.findFirst({
      where: { tenantId, productSku: order.productSku, isActive: true },
      include: { components: { orderBy: { lineNo: 'asc' } } },
    });
    if (!master) return [];

    return master.components.map((c) => ({
      sku: Sku.of(c.componentSku),
      requiredPerUnit: Quantity.of(c.qtyPerUnitValue, c.qtyPerUnitUom),
      scrapBasisPoints: c.scrapBasisPoints,
      yieldBasisPoints: c.yieldBasisPoints,
      minPack: Quantity.of(c.minPackValue, c.minPackUom),
    }));
  }
}
