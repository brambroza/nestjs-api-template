import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../shared/database';
import { Warehouse, type WarehouseSnapshot } from '../domain';
import type {
  ListWarehousesOptions,
  WarehouseRepository,
} from '../application/ports/warehouse.repository';

@Injectable()
export class PrismaWarehouseRepository implements WarehouseRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(tenantId: string, id: string): Promise<Warehouse | null> {
    const row = await this.prisma.warehouse.findFirst({
      where: { tenantId, id },
    });
    return row ? Warehouse.fromSnapshot(rowToSnapshot(row)) : null;
  }

  async findByCode(tenantId: string, code: string): Promise<Warehouse | null> {
    const row = await this.prisma.warehouse.findFirst({
      where: { tenantId, code },
    });
    return row ? Warehouse.fromSnapshot(rowToSnapshot(row)) : null;
  }

  async findDefaultForBranch(
    tenantId: string,
    branchId: string,
  ): Promise<Warehouse | null> {
    const row = await this.prisma.warehouse.findFirst({
      where: { tenantId, branchId, isDefault: true },
    });
    return row ? Warehouse.fromSnapshot(rowToSnapshot(row)) : null;
  }

  async list(
    tenantId: string,
    opts: ListWarehousesOptions,
  ): Promise<{ items: readonly Warehouse[]; total: number }> {
    const where = {
      tenantId,
      ...(opts.activeOnly ? { isActive: true } : {}),
      ...(opts.branchId !== null ? { branchId: opts.branchId } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.warehouse.findMany({
        where,
        orderBy: [{ branchId: 'asc' }, { code: 'asc' }],
        take: opts.limit,
        skip: opts.offset,
      }),
      this.prisma.warehouse.count({ where }),
    ]);
    return {
      items: rows.map((r) => Warehouse.fromSnapshot(rowToSnapshot(r))),
      total,
    };
  }

  async create(warehouse: Warehouse): Promise<void> {
    const s = warehouse.snapshot();
    await this.prisma.warehouse.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        branchId: s.branchId,
        code: s.code,
        name: s.name,
        isDefault: s.isDefault,
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
  branchId: string;
  code: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): WarehouseSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    branchId: row.branchId,
    code: row.code,
    name: row.name,
    isDefault: row.isDefault,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
