import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import type {
  ApRefLookup,
  CompanyRef,
  ItemRef,
  PurchaseOrderForMatching,
  VendorRef,
} from '../application/ports';

/** Direct reads of master-data and purchase tables (lookup-port pattern). */
@Injectable()
export class PrismaApRefLookup implements ApRefLookup {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findCompany(tenantId: string, id: string): Promise<CompanyRef | null> {
    return this.txm.getClient().company.findFirst({
      where: { tenantId, id },
      select: {
        id: true,
        legalName: true,
        taxId: true,
        baseCurrency: true,
        isActive: true,
      },
    });
  }
  async findVendor(tenantId: string, id: string): Promise<VendorRef | null> {
    return this.txm.getClient().vendor.findFirst({
      where: { tenantId, id },
      select: {
        id: true,
        code: true,
        name: true,
        taxId: true,
        paymentTermsDays: true,
        isActive: true,
      },
    });
  }
  async findItem(tenantId: string, id: string): Promise<ItemRef | null> {
    return this.txm.getClient().item.findFirst({
      where: { tenantId, id },
      select: {
        id: true,
        sku: true,
        name: true,
        defaultUomCode: true,
        isActive: true,
      },
    });
  }
  async findPurchaseOrderForMatching(
    tenantId: string,
    id: string,
  ): Promise<PurchaseOrderForMatching | null> {
    const po = await this.txm.getClient().purchaseOrder.findFirst({
      where: { tenantId, id },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
    });
    if (!po) return null;
    return {
      id: po.id,
      number: po.number,
      companyId: po.companyId,
      vendorId: po.vendorId,
      currency: po.currency,
      paymentTermsDays: po.paymentTermsDays,
      status: po.status,
      lines: po.lines.map((l) => ({
        id: l.id,
        itemId: l.itemId,
        itemSku: l.itemSku,
        description: l.description,
        uomCode: l.uomCode,
        quantity: l.quantity,
        receivedQty: l.receivedQty,
        unitPriceMinor: l.unitPriceMinor,
        discountBp: l.discountBp,
        taxCodeId: l.taxCodeId,
        taxCode: l.taxCode,
        taxRateBp: l.taxRateBp,
      })),
    };
  }
}
