import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import type { AccountInfo, LedgerAccountType } from '../domain';
import type { LedgerCompanyRef, LedgerRefLookup } from '../application/ports';

const ACCOUNT_TYPES: readonly LedgerAccountType[] = [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'EXPENSE',
];

interface AccountRow {
  id: string;
  code: string;
  name: string;
  nameTh: string | null;
  type: string;
  isPostable: boolean;
  isActive: boolean;
}

function toInfo(r: AccountRow): AccountInfo | null {
  const type = ACCOUNT_TYPES.find((t) => t === r.type);
  return type
    ? {
        id: r.id,
        code: r.code,
        name: r.name,
        nameTh: r.nameTh,
        type,
        isPostable: r.isPostable,
        isActive: r.isActive,
      }
    : null;
}

/** Reads md_company and fin_account directly (lookup-port pattern). */
@Injectable()
export class PrismaLedgerRefLookup implements LedgerRefLookup {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findCompany(
    tenantId: string,
    id: string,
  ): Promise<LedgerCompanyRef | null> {
    const c = await this.txm.getClient().company.findFirst({
      where: { id, tenantId },
      select: { id: true, legalName: true, baseCurrency: true, isActive: true },
    });
    return c;
  }

  async listAccounts(tenantId: string): Promise<readonly AccountInfo[]> {
    const rows = await this.txm.getClient().account.findMany({
      where: { tenantId },
      orderBy: { code: 'asc' },
    });
    const out: AccountInfo[] = [];
    for (const r of rows) {
      const a = toInfo(r);
      if (a) out.push(a);
    }
    return out;
  }

  async findAccount(tenantId: string, id: string): Promise<AccountInfo | null> {
    const r = await this.txm.getClient().account.findFirst({
      where: { id, tenantId },
    });
    return r ? toInfo(r) : null;
  }

  async findAccountByCode(
    tenantId: string,
    code: string,
  ): Promise<AccountInfo | null> {
    const r = await this.txm.getClient().account.findFirst({
      where: { tenantId, code: code.trim() },
    });
    return r ? toInfo(r) : null;
  }
}
