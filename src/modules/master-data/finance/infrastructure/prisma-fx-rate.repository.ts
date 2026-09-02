import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import {
  FxRate,
  FxRateSource,
  type FxRateSnapshot,
  type IsoDate,
} from '../domain';
import type { FxRateRepository } from '../application/ports/fx-rate.repository';

import { dateFromDb, dateToDb } from './date-mapping';

@Injectable()
export class PrismaFxRateRepository implements FxRateRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findExact(
    tenantId: string,
    baseCurrency: string,
    quoteCurrency: string,
    rateDate: IsoDate,
  ): Promise<FxRate | null> {
    const row = await this.txm.getClient().fxRate.findFirst({
      where: {
        tenantId,
        baseCurrency,
        quoteCurrency,
        rateDate: dateToDb(rateDate),
      },
    });
    return row ? FxRate.fromSnapshot(toSnapshot(row)) : null;
  }

  async findLatestOnOrBefore(
    tenantId: string,
    baseCurrency: string,
    quoteCurrency: string,
    rateDate: IsoDate,
  ): Promise<FxRate | null> {
    const row = await this.txm.getClient().fxRate.findFirst({
      where: {
        tenantId,
        baseCurrency,
        quoteCurrency,
        rateDate: { lte: dateToDb(rateDate) },
      },
      orderBy: { rateDate: 'desc' },
    });
    return row ? FxRate.fromSnapshot(toSnapshot(row)) : null;
  }

  async list(
    tenantId: string,
    opts: {
      readonly baseCurrency: string;
      readonly quoteCurrency?: string | null;
      readonly from: IsoDate;
      readonly to: IsoDate;
    },
  ): Promise<readonly FxRate[]> {
    const rows = await this.txm.getClient().fxRate.findMany({
      where: {
        tenantId,
        baseCurrency: opts.baseCurrency,
        ...(opts.quoteCurrency ? { quoteCurrency: opts.quoteCurrency } : {}),
        rateDate: { gte: dateToDb(opts.from), lte: dateToDb(opts.to) },
      },
      orderBy: [{ rateDate: 'desc' }, { quoteCurrency: 'asc' }],
    });
    return rows.map((r) => FxRate.fromSnapshot(toSnapshot(r)));
  }

  async upsert(rate: FxRate): Promise<void> {
    const s = rate.snapshot();
    const key = {
      tenantId: s.tenantId,
      baseCurrency: s.baseCurrency,
      quoteCurrency: s.quoteCurrency,
      rateDate: dateToDb(s.rateDate),
    };
    await this.txm.getClient().fxRate.upsert({
      where: { tenantId_baseCurrency_quoteCurrency_rateDate: key },
      update: {
        rateScaled: s.rateScaled,
        source: s.source,
        fetchedAt: s.fetchedAt,
        createdBy: s.createdBy,
      },
      create: {
        id: s.id,
        ...key,
        rateScaled: s.rateScaled,
        source: s.source,
        fetchedAt: s.fetchedAt,
        createdBy: s.createdBy,
      },
    });
  }
}

function toSnapshot(row: {
  id: string;
  tenantId: string;
  baseCurrency: string;
  quoteCurrency: string;
  rateDate: Date;
  rateScaled: bigint;
  source: string;
  fetchedAt: Date;
  createdBy: string | null;
}): FxRateSnapshot {
  const source =
    row.source === FxRateSource.Bot ? FxRateSource.Bot : FxRateSource.Manual;
  if (row.source !== FxRateSource.Bot && row.source !== FxRateSource.Manual) {
    throw new Error(`fin_fx_rate.source holds unknown value "${row.source}"`);
  }
  return {
    id: row.id,
    tenantId: row.tenantId,
    baseCurrency: row.baseCurrency,
    quoteCurrency: row.quoteCurrency,
    rateDate: dateFromDb(row.rateDate),
    rateScaled: row.rateScaled,
    source,
    fetchedAt: row.fetchedAt,
    createdBy: row.createdBy,
  };
}
