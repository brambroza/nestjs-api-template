import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../shared/database';
import { Branch, type BranchSnapshot } from '../domain';
import type {
  BranchRepository,
  ListBranchesOptions,
} from '../application/ports/branch.repository';

@Injectable()
export class PrismaBranchRepository implements BranchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(tenantId: string, id: string): Promise<Branch | null> {
    const row = await this.prisma.branch.findFirst({ where: { tenantId, id } });
    return row ? Branch.fromSnapshot(rowToSnapshot(row)) : null;
  }

  async findByCode(tenantId: string, code: string): Promise<Branch | null> {
    const row = await this.prisma.branch.findFirst({
      where: { tenantId, code },
    });
    return row ? Branch.fromSnapshot(rowToSnapshot(row)) : null;
  }

  async findByCompanyAndNumber(
    tenantId: string,
    companyId: string,
    branchNumber: string,
  ): Promise<Branch | null> {
    const row = await this.prisma.branch.findFirst({
      where: { tenantId, companyId, branchNumber },
    });
    return row ? Branch.fromSnapshot(rowToSnapshot(row)) : null;
  }

  async list(
    tenantId: string,
    opts: ListBranchesOptions,
  ): Promise<{ items: readonly Branch[]; total: number }> {
    const where = {
      tenantId,
      ...(opts.activeOnly ? { isActive: true } : {}),
      ...(opts.companyId !== null ? { companyId: opts.companyId } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.branch.findMany({
        where,
        orderBy: [{ companyId: 'asc' }, { branchNumber: 'asc' }],
        take: opts.limit,
        skip: opts.offset,
      }),
      this.prisma.branch.count({ where }),
    ]);
    return {
      items: rows.map((r) => Branch.fromSnapshot(rowToSnapshot(r))),
      total,
    };
  }

  async create(branch: Branch): Promise<void> {
    const s = branch.snapshot();
    await this.prisma.branch.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        companyId: s.companyId,
        code: s.code,
        name: s.name,
        branchNumber: s.branchNumber,
        addressLine1: s.address.line1,
        addressLine2: s.address.line2,
        subDistrict: s.address.subDistrict,
        district: s.address.district,
        province: s.address.province,
        postalCode: s.address.postalCode,
        isHeadOffice: s.isHeadOffice,
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
  companyId: string;
  code: string;
  name: string;
  branchNumber: string;
  addressLine1: string | null;
  addressLine2: string | null;
  subDistrict: string | null;
  district: string | null;
  province: string | null;
  postalCode: string | null;
  isHeadOffice: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): BranchSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    companyId: row.companyId,
    code: row.code,
    name: row.name,
    branchNumber: row.branchNumber,
    address: {
      line1: row.addressLine1,
      line2: row.addressLine2,
      subDistrict: row.subDistrict,
      district: row.district,
      province: row.province,
      postalCode: row.postalCode,
    },
    isHeadOffice: row.isHeadOffice,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
