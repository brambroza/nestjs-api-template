import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import { Currency, type CurrencySnapshot } from '../domain';
import type { CurrencyRepository } from '../application/ports/currency.repository';

@Injectable()
export class PrismaCurrencyRepository implements CurrencyRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findByCode(tenantId: string, code: string): Promise<Currency | null> {
    const row = await this.txm
      .getClient()
      .currency.findFirst({ where: { tenantId, code } });
    return row ? Currency.fromSnapshot(toSnapshot(row)) : null;
  }

  async list(
    tenantId: string,
    opts: { readonly activeOnly: boolean },
  ): Promise<readonly Currency[]> {
    const rows = await this.txm.getClient().currency.findMany({
      where: { tenantId, ...(opts.activeOnly ? { isActive: true } : {}) },
      orderBy: { code: 'asc' },
    });
    return rows.map((r) => Currency.fromSnapshot(toSnapshot(r)));
  }

  async create(currency: Currency): Promise<void> {
    const s = currency.snapshot();
    await this.txm.getClient().currency.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        code: s.code,
        name: s.name,
        minorUnits: s.minorUnits,
        isActive: s.isActive,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      },
    });
  }
}

function toSnapshot(row: {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  minorUnits: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): CurrencySnapshot {
  return { ...row };
}
