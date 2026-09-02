import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../shared/database';
import { Vendor, type VendorSnapshot } from '../domain';
import type {
  ListVendorsOptions,
  VendorRepository,
} from '../application/ports/vendor.repository';

@Injectable()
export class PrismaVendorRepository implements VendorRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(tenantId: string, id: string): Promise<Vendor | null> {
    const row = await this.prisma.vendor.findFirst({
      where: { tenantId, id },
    });
    return row ? Vendor.fromSnapshot(rowToSnapshot(row)) : null;
  }

  async findByCode(tenantId: string, code: string): Promise<Vendor | null> {
    const row = await this.prisma.vendor.findFirst({
      where: { tenantId, code },
    });
    return row ? Vendor.fromSnapshot(rowToSnapshot(row)) : null;
  }

  async list(
    tenantId: string,
    opts: ListVendorsOptions,
  ): Promise<{ items: readonly Vendor[]; total: number }> {
    const where = {
      tenantId,
      ...(opts.activeOnly ? { isActive: true } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.vendor.findMany({
        where,
        orderBy: [{ code: 'asc' }],
        take: opts.limit,
        skip: opts.offset,
      }),
      this.prisma.vendor.count({ where }),
    ]);
    return {
      items: rows.map((r) => Vendor.fromSnapshot(rowToSnapshot(r))),
      total,
    };
  }

  async create(vendor: Vendor): Promise<void> {
    const s = vendor.snapshot();
    await this.prisma.vendor.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        code: s.code,
        name: s.name,
        taxId: s.taxId,
        paymentTermsDays: s.paymentTermsDays,
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
  code: string;
  name: string;
  taxId: string | null;
  paymentTermsDays: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): VendorSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    code: row.code,
    name: row.name,
    taxId: row.taxId,
    paymentTermsDays: row.paymentTermsDays,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
