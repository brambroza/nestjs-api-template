import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import { Item, isTrackingPolicy, type ItemSnapshot } from '../domain';
import type {
  ItemRepository,
  ListItemsOptions,
} from '../application/ports/item.repository';

/** MSSQL allows 2100 parameters per statement; 12 columns × 150 rows = 1800. */
const CREATE_MANY_CHUNK = 150;

@Injectable()
export class PrismaItemRepository implements ItemRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findById(tenantId: string, id: string): Promise<Item | null> {
    const row = await this.txm
      .getClient()
      .item.findFirst({ where: { tenantId, id } });
    return row ? Item.fromSnapshot(rowToSnapshot(row)) : null;
  }

  async findBySku(tenantId: string, sku: string): Promise<Item | null> {
    const row = await this.txm
      .getClient()
      .item.findFirst({ where: { tenantId, sku } });
    return row ? Item.fromSnapshot(rowToSnapshot(row)) : null;
  }

  async findBySkus(
    tenantId: string,
    skus: readonly string[],
  ): Promise<readonly Item[]> {
    if (skus.length === 0) return [];
    const out: Item[] = [];
    for (let i = 0; i < skus.length; i += 1000) {
      const rows = await this.txm.getClient().item.findMany({
        where: { tenantId, sku: { in: [...skus.slice(i, i + 1000)] } },
      });
      out.push(...rows.map((r) => Item.fromSnapshot(rowToSnapshot(r))));
    }
    return out;
  }

  async list(
    tenantId: string,
    opts: ListItemsOptions,
  ): Promise<{ items: readonly Item[]; total: number }> {
    const db = this.txm.getClient();
    const where = {
      tenantId,
      ...(opts.activeOnly ? { isActive: true } : {}),
    };
    const [rows, total] = await Promise.all([
      db.item.findMany({
        where,
        orderBy: [{ sku: 'asc' }],
        take: opts.limit,
        skip: opts.offset,
      }),
      db.item.count({ where }),
    ]);
    return {
      items: rows.map((r) => Item.fromSnapshot(rowToSnapshot(r))),
      total,
    };
  }

  async create(item: Item): Promise<void> {
    await this.txm.getClient().item.create({ data: toRow(item.snapshot()) });
  }

  async createMany(items: readonly Item[]): Promise<void> {
    const db = this.txm.getClient();
    for (let i = 0; i < items.length; i += CREATE_MANY_CHUNK) {
      await db.item.createMany({
        data: items
          .slice(i, i + CREATE_MANY_CHUNK)
          .map((it) => toRow(it.snapshot())),
      });
    }
  }
}

function toRow(s: ItemSnapshot): {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  description: string | null;
  defaultUomCode: string;
  categoryId: string | null;
  trackingPolicy: string;
  shelfLifeDays: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
} {
  return {
    id: s.id,
    tenantId: s.tenantId,
    sku: s.sku,
    name: s.name,
    description: s.description,
    defaultUomCode: s.defaultUomCode,
    categoryId: s.categoryId,
    trackingPolicy: s.trackingPolicy,
    shelfLifeDays: s.shelfLifeDays,
    isActive: s.isActive,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

function rowToSnapshot(row: {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  description: string | null;
  defaultUomCode: string;
  categoryId: string | null;
  trackingPolicy: string;
  shelfLifeDays: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ItemSnapshot {
  if (!isTrackingPolicy(row.trackingPolicy)) {
    throw new Error(
      `md_item.trackingPolicy holds unknown value "${row.trackingPolicy}"`,
    );
  }
  return {
    id: row.id,
    tenantId: row.tenantId,
    sku: row.sku,
    name: row.name,
    description: row.description,
    defaultUomCode: row.defaultUomCode,
    categoryId: row.categoryId,
    trackingPolicy: row.trackingPolicy,
    shelfLifeDays: row.shelfLifeDays,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
