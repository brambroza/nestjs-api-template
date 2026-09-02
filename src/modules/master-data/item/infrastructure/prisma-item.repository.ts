import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../shared/database';
import { Item, type ItemSnapshot } from '../domain';
import type {
  ItemRepository,
  ListItemsOptions,
} from '../application/ports/item.repository';

@Injectable()
export class PrismaItemRepository implements ItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(tenantId: string, id: string): Promise<Item | null> {
    const row = await this.prisma.item.findFirst({
      where: { tenantId, id },
    });
    return row ? Item.fromSnapshot(rowToSnapshot(row)) : null;
  }

  async findBySku(tenantId: string, sku: string): Promise<Item | null> {
    const row = await this.prisma.item.findFirst({
      where: { tenantId, sku },
    });
    return row ? Item.fromSnapshot(rowToSnapshot(row)) : null;
  }

  async list(
    tenantId: string,
    opts: ListItemsOptions,
  ): Promise<{ items: readonly Item[]; total: number }> {
    const where = {
      tenantId,
      ...(opts.activeOnly ? { isActive: true } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.item.findMany({
        where,
        orderBy: [{ sku: 'asc' }],
        take: opts.limit,
        skip: opts.offset,
      }),
      this.prisma.item.count({ where }),
    ]);
    return {
      items: rows.map((r) => Item.fromSnapshot(rowToSnapshot(r))),
      total,
    };
  }

  async create(item: Item): Promise<void> {
    const s = item.snapshot();
    await this.prisma.item.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        sku: s.sku,
        name: s.name,
        description: s.description,
        defaultUomCode: s.defaultUomCode,
        isActive: s.isActive,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      },
    });
  }
}

function rowToSnapshot(row: {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  description: string | null;
  defaultUomCode: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ItemSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    sku: row.sku,
    name: row.name,
    description: row.description,
    defaultUomCode: row.defaultUomCode,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
