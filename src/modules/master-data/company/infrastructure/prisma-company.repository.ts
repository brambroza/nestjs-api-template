import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../shared/database';
import { Company, type CompanySnapshot } from '../domain';
import type {
  CompanyRepository,
  ListCompaniesOptions,
} from '../application/ports/company.repository';

@Injectable()
export class PrismaCompanyRepository implements CompanyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(tenantId: string, id: string): Promise<Company | null> {
    const row = await this.prisma.company.findFirst({
      where: { tenantId, id },
    });
    return row ? Company.fromSnapshot(rowToSnapshot(row)) : null;
  }

  async findByCode(tenantId: string, code: string): Promise<Company | null> {
    const row = await this.prisma.company.findFirst({
      where: { tenantId, code },
    });
    return row ? Company.fromSnapshot(rowToSnapshot(row)) : null;
  }

  async list(
    tenantId: string,
    opts: ListCompaniesOptions,
  ): Promise<{ items: readonly Company[]; total: number }> {
    const where = {
      tenantId,
      ...(opts.activeOnly ? { isActive: true } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        orderBy: [{ code: 'asc' }],
        take: opts.limit,
        skip: opts.offset,
      }),
      this.prisma.company.count({ where }),
    ]);
    return {
      items: rows.map((r) => Company.fromSnapshot(rowToSnapshot(r))),
      total,
    };
  }

  async create(company: Company): Promise<void> {
    const s = company.snapshot();
    await this.prisma.company.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        code: s.code,
        name: s.name,
        legalName: s.legalName,
        taxId: s.taxId,
        baseCurrency: s.baseCurrency,
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
  legalName: string;
  taxId: string | null;
  baseCurrency: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): CompanySnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    code: row.code,
    name: row.name,
    legalName: row.legalName,
    taxId: row.taxId,
    baseCurrency: row.baseCurrency,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
