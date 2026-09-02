import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import type {
  CompanyRef,
  ItemRef,
  PurchaseRefLookup,
  VendorRef,
} from '../application/ports/purchase-ref-lookup.port';

/** Direct reads of master-data tables (lookup-port pattern; no cross-module domain import). */
@Injectable()
export class PrismaPurchaseRefLookup implements PurchaseRefLookup {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findCompany(
    tenantId: string,
    companyId: string,
  ): Promise<CompanyRef | null> {
    return this.txm.getClient().company.findFirst({
      where: { tenantId, id: companyId },
      select: { id: true, baseCurrency: true, isActive: true },
    });
  }

  async findVendor(
    tenantId: string,
    vendorId: string,
  ): Promise<VendorRef | null> {
    return this.txm.getClient().vendor.findFirst({
      where: { tenantId, id: vendorId },
      select: {
        id: true,
        code: true,
        name: true,
        paymentTermsDays: true,
        isActive: true,
      },
    });
  }

  async findItem(tenantId: string, itemId: string): Promise<ItemRef | null> {
    return this.txm.getClient().item.findFirst({
      where: { tenantId, id: itemId },
      select: {
        id: true,
        sku: true,
        name: true,
        defaultUomCode: true,
        trackingPolicy: true,
        isActive: true,
      },
    });
  }

  async currencyExists(tenantId: string, code: string): Promise<boolean> {
    const row = await this.txm.getClient().currency.findFirst({
      where: { tenantId, code, isActive: true },
      select: { id: true },
    });
    return row !== null;
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
}
