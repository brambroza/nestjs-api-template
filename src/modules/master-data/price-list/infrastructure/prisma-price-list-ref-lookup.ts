import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import type {
  PriceListItemRef,
  PriceListRefLookup,
} from '../application/ports/price-list-ref-lookup.port';

@Injectable()
export class PrismaPriceListRefLookup implements PriceListRefLookup {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findItem(
    tenantId: string,
    itemId: string,
  ): Promise<PriceListItemRef | null> {
    const row = await this.txm.getClient().item.findFirst({
      where: { tenantId, id: itemId },
      select: { id: true, sku: true, defaultUomCode: true, isActive: true },
    });
    return row;
  }

  async customerExists(tenantId: string, customerId: string): Promise<boolean> {
    const row = await this.txm.getClient().customer.findFirst({
      where: { tenantId, id: customerId, isActive: true },
      select: { id: true },
    });
    return row !== null;
  }

  async uomExists(tenantId: string, uomCode: string): Promise<boolean> {
    const row = await this.txm.getClient().uomDefinition.findFirst({
      where: { tenantId, code: uomCode },
      select: { id: true },
    });
    return row !== null;
  }
}
