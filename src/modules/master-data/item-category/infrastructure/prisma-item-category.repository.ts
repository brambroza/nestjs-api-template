import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import { ItemCategory, type ItemCategorySnapshot } from '../domain';
import type { ItemCategoryRepository } from '../application/ports/item-category.repository';

@Injectable()
export class PrismaItemCategoryRepository implements ItemCategoryRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findById(tenantId: string, id: string): Promise<ItemCategory | null> {
    const row = await this.txm
      .getClient()
      .itemCategory.findFirst({ where: { tenantId, id } });
    return row ? ItemCategory.fromSnapshot(toSnapshot(row)) : null;
  }

  async findByCode(
    tenantId: string,
    code: string,
  ): Promise<ItemCategory | null> {
    const row = await this.txm
      .getClient()
      .itemCategory.findFirst({ where: { tenantId, code } });
    return row ? ItemCategory.fromSnapshot(toSnapshot(row)) : null;
  }

  async listAll(
    tenantId: string,
    opts: { readonly activeOnly: boolean },
  ): Promise<readonly ItemCategory[]> {
    const rows = await this.txm.getClient().itemCategory.findMany({
      where: { tenantId, ...(opts.activeOnly ? { isActive: true } : {}) },
      orderBy: [{ depth: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => ItemCategory.fromSnapshot(toSnapshot(r)));
  }

  async create(category: ItemCategory): Promise<void> {
    const s = category.snapshot();
    await this.txm.getClient().itemCategory.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        code: s.code,
        name: s.name,
        parentId: s.parentId,
        path: s.path,
        depth: s.depth,
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
  parentId: string | null;
  path: string;
  depth: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ItemCategorySnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    code: row.code,
    name: row.name,
    parentId: row.parentId,
    path: row.path,
    depth: row.depth,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
