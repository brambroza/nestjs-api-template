import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import { Bom, type BomComponentSnapshot, type BomSnapshot } from '../domain';
import type { BomRepository } from '../application/ports/bom.repository';

const withComponents = {
  components: { orderBy: { lineNo: 'asc' as const } },
};

@Injectable()
export class PrismaBomRepository implements BomRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findById(tenantId: string, id: string): Promise<Bom | null> {
    const row = await this.txm.getClient().bom.findFirst({
      where: { tenantId, id },
      include: withComponents,
    });
    return row ? Bom.fromSnapshot(toSnapshot(row)) : null;
  }

  async findActiveForItem(
    tenantId: string,
    itemId: string,
  ): Promise<Bom | null> {
    const row = await this.txm.getClient().bom.findFirst({
      where: { tenantId, itemId, isActive: true },
      include: withComponents,
    });
    return row ? Bom.fromSnapshot(toSnapshot(row)) : null;
  }

  async listForItem(tenantId: string, itemId: string): Promise<readonly Bom[]> {
    const rows = await this.txm.getClient().bom.findMany({
      where: { tenantId, itemId },
      include: withComponents,
      orderBy: { version: 'desc' },
    });
    return rows.map((r) => Bom.fromSnapshot(toSnapshot(r)));
  }

  async create(bom: Bom): Promise<void> {
    const s = bom.snapshot();
    await this.txm.getClient().bom.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        itemId: s.itemId,
        productSku: s.productSku,
        version: s.version,
        name: s.name,
        isActive: s.isActive,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        components: {
          create: s.components.map((c) => ({
            id: c.id,
            tenantId: s.tenantId,
            lineNo: c.lineNo,
            componentItemId: c.componentItemId,
            componentSku: c.componentSku,
            qtyPerUnitValue: c.qtyPerUnit,
            qtyPerUnitUom: c.qtyPerUnitUom,
            scrapBasisPoints: c.scrapBasisPoints,
            yieldBasisPoints: c.yieldBasisPoints,
            minPackValue: c.minPack,
            minPackUom: c.minPackUom,
          })),
        },
      },
    });
  }

  async save(bom: Bom): Promise<void> {
    const s = bom.snapshot();
    await this.txm.getClient().bom.update({
      where: { id: s.id, tenantId: s.tenantId },
      data: { isActive: s.isActive, name: s.name, updatedAt: s.updatedAt },
    });
  }
}

function toSnapshot(row: {
  id: string;
  tenantId: string;
  itemId: string;
  productSku: string;
  version: number;
  name: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  components: readonly {
    id: string;
    lineNo: number;
    componentItemId: string;
    componentSku: string;
    qtyPerUnitValue: bigint;
    qtyPerUnitUom: string;
    scrapBasisPoints: bigint;
    yieldBasisPoints: bigint;
    minPackValue: bigint;
    minPackUom: string;
  }[];
}): BomSnapshot {
  const components: BomComponentSnapshot[] = row.components.map((c) => ({
    id: c.id,
    lineNo: c.lineNo,
    componentItemId: c.componentItemId,
    componentSku: c.componentSku,
    qtyPerUnit: c.qtyPerUnitValue,
    qtyPerUnitUom: c.qtyPerUnitUom,
    scrapBasisPoints: c.scrapBasisPoints,
    yieldBasisPoints: c.yieldBasisPoints,
    minPack: c.minPackValue,
    minPackUom: c.minPackUom,
  }));
  return {
    id: row.id,
    tenantId: row.tenantId,
    itemId: row.itemId,
    productSku: row.productSku,
    version: row.version,
    name: row.name,
    isActive: row.isActive,
    components,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
