import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../shared/database';
import { UomDefinition, type UomDefinitionSnapshot } from '../domain';
import type {
  ListUomsOptions,
  UomRepository,
} from '../application/ports/uom.repository';

@Injectable()
export class PrismaUomRepository implements UomRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(tenantId: string, id: string): Promise<UomDefinition | null> {
    const row = await this.prisma.uomDefinition.findFirst({
      where: { tenantId, id },
    });
    return row ? UomDefinition.fromSnapshot(rowToSnapshot(row)) : null;
  }

  async findByCode(
    tenantId: string,
    code: string,
  ): Promise<UomDefinition | null> {
    const row = await this.prisma.uomDefinition.findFirst({
      where: { tenantId, code },
    });
    return row ? UomDefinition.fromSnapshot(rowToSnapshot(row)) : null;
  }

  async list(
    tenantId: string,
    opts: ListUomsOptions,
  ): Promise<{ items: readonly UomDefinition[]; total: number }> {
    const where = { tenantId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.uomDefinition.findMany({
        where,
        orderBy: [{ code: 'asc' }],
        take: opts.limit,
        skip: opts.offset,
      }),
      this.prisma.uomDefinition.count({ where }),
    ]);
    return {
      items: rows.map((r) => UomDefinition.fromSnapshot(rowToSnapshot(r))),
      total,
    };
  }

  async create(uom: UomDefinition): Promise<void> {
    const s = uom.snapshot();
    await this.prisma.uomDefinition.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        code: s.code,
        name: s.name,
        baseUomCode: s.baseUomCode,
        conversionRatio: s.conversionRatio,
      },
    });
  }
}

function rowToSnapshot(row: {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  baseUomCode: string | null;
  conversionRatio: bigint;
}): UomDefinitionSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    code: row.code,
    name: row.name,
    baseUomCode: row.baseUomCode,
    conversionRatio: row.conversionRatio,
  };
}
