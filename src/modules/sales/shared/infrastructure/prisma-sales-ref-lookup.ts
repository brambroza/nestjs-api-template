import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import type {
  CompanyRef,
  CustomerRef,
  ItemRef,
  SalesRefLookup,
} from '../application/ports/sales-ref-lookup.port';

/** Direct reads of master-data tables (lookup-port pattern; no cross-module domain import). */
@Injectable()
export class PrismaSalesRefLookup implements SalesRefLookup {
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

  async findCustomer(
    tenantId: string,
    customerId: string,
  ): Promise<CustomerRef | null> {
    const row = await this.txm.getClient().customer.findFirst({
      where: { tenantId, id: customerId },
      select: {
        id: true,
        code: true,
        name: true,
        paymentTermsDays: true,
        creditLimitSatang: true,
        isActive: true,
      },
    });
    return row
      ? {
          id: row.id,
          code: row.code,
          name: row.name,
          paymentTermsDays: row.paymentTermsDays,
          creditLimitMinor: row.creditLimitSatang,
          isActive: row.isActive,
        }
      : null;
  }

  async findItem(tenantId: string, itemId: string): Promise<ItemRef | null> {
    return this.txm.getClient().item.findFirst({
      where: { tenantId, id: itemId },
      select: {
        id: true,
        sku: true,
        name: true,
        defaultUomCode: true,
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
