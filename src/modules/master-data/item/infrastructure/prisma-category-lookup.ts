import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import type { CategoryLookup } from '../application/ports/category-lookup.port';

@Injectable()
export class PrismaCategoryLookup implements CategoryLookup {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async exists(tenantId: string, categoryId: string): Promise<boolean> {
    const row = await this.txm.getClient().itemCategory.findFirst({
      where: { tenantId, id: categoryId, isActive: true },
      select: { id: true },
    });
    return row !== null;
  }

  async idsByCodes(
    tenantId: string,
    codes: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    if (codes.length === 0) return new Map();
    const rows = await this.txm.getClient().itemCategory.findMany({
      where: { tenantId, isActive: true, code: { in: [...codes] } },
      select: { id: true, code: true },
    });
    return new Map(rows.map((r) => [r.code, r.id]));
  }
}
