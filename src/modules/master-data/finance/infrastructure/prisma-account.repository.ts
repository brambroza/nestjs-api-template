import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import { Account, isAccountType, type AccountSnapshot } from '../domain';
import type { AccountRepository } from '../application/ports/account.repository';

@Injectable()
export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findById(tenantId: string, id: string): Promise<Account | null> {
    const row = await this.txm
      .getClient()
      .account.findFirst({ where: { tenantId, id } });
    return row ? Account.fromSnapshot(toSnapshot(row)) : null;
  }

  async findByCode(tenantId: string, code: string): Promise<Account | null> {
    const row = await this.txm
      .getClient()
      .account.findFirst({ where: { tenantId, code } });
    return row ? Account.fromSnapshot(toSnapshot(row)) : null;
  }

  async listAll(
    tenantId: string,
    opts: { readonly activeOnly: boolean },
  ): Promise<readonly Account[]> {
    const rows = await this.txm.getClient().account.findMany({
      where: { tenantId, ...(opts.activeOnly ? { isActive: true } : {}) },
      orderBy: { code: 'asc' },
    });
    return rows.map((r) => Account.fromSnapshot(toSnapshot(r)));
  }

  async create(account: Account): Promise<void> {
    const s = account.snapshot();
    await this.txm.getClient().account.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        code: s.code,
        name: s.name,
        nameTh: s.nameTh,
        type: s.type,
        parentId: s.parentId,
        path: s.path,
        depth: s.depth,
        isPostable: s.isPostable,
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
  nameTh: string | null;
  type: string;
  parentId: string | null;
  path: string;
  depth: number;
  isPostable: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): AccountSnapshot {
  if (!isAccountType(row.type))
    throw new Error(`fin_account.type holds unknown value "${row.type}"`);
  return { ...row, type: row.type };
}
