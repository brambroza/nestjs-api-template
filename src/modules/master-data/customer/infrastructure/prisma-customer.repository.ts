import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../shared/database';
import { Customer, type CustomerSnapshot } from '../domain';
import type {
  CustomerRepository,
  ListCustomersOptions,
} from '../application/ports/customer.repository';

@Injectable()
export class PrismaCustomerRepository implements CustomerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(tenantId: string, id: string): Promise<Customer | null> {
    const row = await this.prisma.customer.findFirst({
      where: { tenantId, id },
    });
    return row ? Customer.fromSnapshot(rowToSnapshot(row)) : null;
  }

  async findByCode(tenantId: string, code: string): Promise<Customer | null> {
    const row = await this.prisma.customer.findFirst({
      where: { tenantId, code },
    });
    return row ? Customer.fromSnapshot(rowToSnapshot(row)) : null;
  }

  async list(
    tenantId: string,
    opts: ListCustomersOptions,
  ): Promise<{ items: readonly Customer[]; total: number }> {
    const where = {
      tenantId,
      ...(opts.activeOnly ? { isActive: true } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: [{ code: 'asc' }],
        take: opts.limit,
        skip: opts.offset,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return {
      items: rows.map((r) => Customer.fromSnapshot(rowToSnapshot(r))),
      total,
    };
  }

  async create(customer: Customer): Promise<void> {
    const s = customer.snapshot();
    await this.prisma.customer.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        code: s.code,
        name: s.name,
        taxId: s.taxId,
        creditLimitSatang: s.creditLimitSatang,
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
  creditLimitSatang: bigint;
  paymentTermsDays: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): CustomerSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    code: row.code,
    name: row.name,
    taxId: row.taxId,
    creditLimitSatang: row.creditLimitSatang,
    paymentTermsDays: row.paymentTermsDays,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
