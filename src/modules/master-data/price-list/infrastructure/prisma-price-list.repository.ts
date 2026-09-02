import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import {
  PriceList,
  PriceListLine,
  isCurrency,
  type PriceCandidate,
  type PriceListLineSnapshot,
  type PriceListSnapshot,
} from '../domain';
import type {
  ListPriceListsOptions,
  PriceListRepository,
} from '../application/ports/price-list.repository';

@Injectable()
export class PrismaPriceListRepository implements PriceListRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findById(tenantId: string, id: string): Promise<PriceList | null> {
    const row = await this.txm
      .getClient()
      .priceList.findFirst({ where: { tenantId, id } });
    return row ? PriceList.fromSnapshot(toListSnapshot(row)) : null;
  }

  async findByCode(tenantId: string, code: string): Promise<PriceList | null> {
    const row = await this.txm
      .getClient()
      .priceList.findFirst({ where: { tenantId, code } });
    return row ? PriceList.fromSnapshot(toListSnapshot(row)) : null;
  }

  async list(
    tenantId: string,
    opts: ListPriceListsOptions,
  ): Promise<{ items: readonly PriceList[]; total: number }> {
    const db = this.txm.getClient();
    const where = {
      tenantId,
      ...(opts.activeOnly ? { isActive: true } : {}),
      ...(opts.customerId === undefined ? {} : { customerId: opts.customerId }),
    };
    const [rows, total] = await Promise.all([
      db.priceList.findMany({
        where,
        orderBy: [{ validFrom: 'desc' }, { code: 'asc' }],
        take: opts.limit,
        skip: opts.offset,
      }),
      db.priceList.count({ where }),
    ]);
    return {
      items: rows.map((r) => PriceList.fromSnapshot(toListSnapshot(r))),
      total,
    };
  }

  async create(list: PriceList): Promise<void> {
    const s = list.snapshot();
    await this.txm.getClient().priceList.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        code: s.code,
        name: s.name,
        currency: s.currency,
        customerId: s.customerId,
        validFrom: s.validFrom,
        validTo: s.validTo,
        isActive: s.isActive,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      },
    });
  }

  async linesOf(
    tenantId: string,
    priceListId: string,
  ): Promise<readonly PriceListLine[]> {
    const rows = await this.txm.getClient().priceListLine.findMany({
      where: { tenantId, priceListId },
      orderBy: [{ itemId: 'asc' }, { uomCode: 'asc' }, { minQty: 'asc' }],
    });
    return rows.map((r) => PriceListLine.fromSnapshot(toLineSnapshot(r)));
  }

  async findLine(
    tenantId: string,
    priceListId: string,
    itemId: string,
    uomCode: string,
    minQty: bigint,
  ): Promise<PriceListLine | null> {
    const row = await this.txm.getClient().priceListLine.findFirst({
      where: { tenantId, priceListId, itemId, uomCode, minQty },
    });
    return row ? PriceListLine.fromSnapshot(toLineSnapshot(row)) : null;
  }

  async addLine(line: PriceListLine): Promise<void> {
    const s = line.snapshot();
    await this.txm.getClient().priceListLine.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        priceListId: s.priceListId,
        itemId: s.itemId,
        uomCode: s.uomCode,
        minQty: s.minQty,
        unitPriceSatang: s.unitPriceSatang,
        createdAt: s.createdAt,
      },
    });
  }

  async candidatesFor(
    tenantId: string,
    itemId: string,
    customerId: string | null,
  ): Promise<readonly PriceCandidate[]> {
    const rows = await this.txm.getClient().priceListLine.findMany({
      where: {
        tenantId,
        itemId,
        priceList: {
          isActive: true,
          OR:
            customerId === null
              ? [{ customerId: null }]
              : [{ customerId: null }, { customerId }],
        },
      },
      include: { priceList: true },
    });
    return rows.map((r) => ({
      list: toListSnapshot(r.priceList),
      line: toLineSnapshot(r),
    }));
  }
}

function toListSnapshot(row: {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  currency: string;
  customerId: string | null;
  validFrom: Date;
  validTo: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): PriceListSnapshot {
  if (!isCurrency(row.currency)) {
    throw new Error(
      `md_price_list.currency holds unknown value "${row.currency}"`,
    );
  }
  return {
    id: row.id,
    tenantId: row.tenantId,
    code: row.code,
    name: row.name,
    currency: row.currency,
    customerId: row.customerId,
    validFrom: row.validFrom,
    validTo: row.validTo,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toLineSnapshot(row: {
  id: string;
  tenantId: string;
  priceListId: string;
  itemId: string;
  uomCode: string;
  minQty: bigint;
  unitPriceSatang: bigint;
  createdAt: Date;
}): PriceListLineSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    priceListId: row.priceListId,
    itemId: row.itemId,
    uomCode: row.uomCode,
    minQty: row.minQty,
    unitPriceSatang: row.unitPriceSatang,
    createdAt: row.createdAt,
  };
}
