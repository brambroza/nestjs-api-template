import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import type { FinanceRefLookup } from '../application/ports/finance-ref-lookup.port';
import type { TenantDirectory } from '../application/ports/tenant-directory.port';

@Injectable()
export class PrismaFinanceRefLookup implements FinanceRefLookup {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async itemExists(tenantId: string, itemId: string): Promise<boolean> {
    const row = await this.txm.getClient().item.findFirst({
      where: { tenantId, id: itemId },
      select: { id: true },
    });
    return row !== null;
  }

  async findCompany(
    tenantId: string,
    companyId: string,
  ): Promise<{ baseCurrency: string; isActive: boolean } | null> {
    return this.txm.getClient().company.findFirst({
      where: { tenantId, id: companyId },
      select: { baseCurrency: true, isActive: true },
    });
  }
}

@Injectable()
export class PrismaTenantDirectory implements TenantDirectory {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async listTenantIds(): Promise<readonly string[]> {
    const rows = await this.txm
      .getClient()
      .tenant.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
    return rows.map((r) => r.id);
  }
}
