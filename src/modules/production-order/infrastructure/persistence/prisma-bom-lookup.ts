import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import type { AppClsStore } from '../../../../shared/cls';
import { PrismaTransactionManager } from '../../../../shared/database';
import { type BomLine, OrderId, Quantity, Sku } from '../../domain';
import type { BomLookupPort } from '../../application/ports/bom-lookup.port';

type BomClient = Pick<Prisma.TransactionClient, 'bomLine'>;

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
    const rows = await client.bomLine.findMany({
      where: { productionOrderId: orderId, tenantId },
    });
    return rows.map((r) => ({
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
}
