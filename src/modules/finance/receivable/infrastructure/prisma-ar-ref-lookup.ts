import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import type {
  ArRefLookup,
  BillingAddressRef,
  BranchRef,
  CompanyRef,
  CustomerRef,
  ItemRef,
  SalesOrderForInvoicing,
} from '../application/ports';

/** Direct reads of master-data and sales tables (lookup-port pattern). */
@Injectable()
export class PrismaArRefLookup implements ArRefLookup {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findCompany(tenantId: string, id: string): Promise<CompanyRef | null> {
    return this.txm.getClient().company.findFirst({
      where: { tenantId, id },
      select: {
        id: true,
        legalName: true,
        taxId: true,
        baseCurrency: true,
        promptPayId: true,
        isActive: true,
      },
    });
  }

  async findBranch(tenantId: string, id: string): Promise<BranchRef | null> {
    return this.txm.getClient().branch.findFirst({
      where: { tenantId, id },
      select: {
        id: true,
        companyId: true,
        branchNumber: true,
        isActive: true,
      },
    });
  }

  async findHeadOfficeBranch(
    tenantId: string,
    companyId: string,
  ): Promise<BranchRef | null> {
    return this.txm.getClient().branch.findFirst({
      where: { tenantId, companyId, isActive: true },
      orderBy: [{ isHeadOffice: 'desc' }, { branchNumber: 'asc' }],
      select: { id: true, companyId: true, branchNumber: true, isActive: true },
    });
  }

  async findCustomer(
    tenantId: string,
    id: string,
  ): Promise<CustomerRef | null> {
    return this.txm.getClient().customer.findFirst({
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

  async findBillingAddress(
    tenantId: string,
    customerId: string,
  ): Promise<BillingAddressRef | null> {
    const a = await this.txm.getClient().partnerAddress.findFirst({
      where: {
        tenantId,
        partnerType: 'CUSTOMER',
        partnerId: customerId,
        addressType: 'BILLING',
        isActive: true,
      },
      orderBy: { isDefault: 'desc' },
    });
    if (!a) return null;
    const text = [
      a.line1,
      a.line2,
      a.subDistrict,
      a.district,
      a.province,
      a.postalCode,
    ]
      .filter((x) => x && x.trim())
      .join(' ');
    return { text, branchNumber: a.branchNumber };
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

  async findSalesOrderForInvoicing(
    tenantId: string,
    id: string,
  ): Promise<SalesOrderForInvoicing | null> {
    const so = await this.txm.getClient().salesOrder.findFirst({
      where: { tenantId, id },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
    });
    if (!so) return null;
    return {
      id: so.id,
      number: so.number,
      companyId: so.companyId,
      customerId: so.customerId,
      currency: so.currency,
      paymentTermsDays: so.paymentTermsDays,
      status: so.status,
      lines: so.lines.map((l) => ({
        id: l.id,
        itemId: l.itemId,
        itemSku: l.itemSku,
        description: l.description,
        uomCode: l.uomCode,
        deliveredQty: l.deliveredQty,
        unitPriceMinor: l.unitPriceMinor,
        priceSource: l.priceSource,
        priceListId: l.priceListId,
        discountBp: l.discountBp,
        taxCodeId: l.taxCodeId,
        taxCode: l.taxCode,
        taxRateBp: l.taxRateBp,
      })),
    };
  }
}
