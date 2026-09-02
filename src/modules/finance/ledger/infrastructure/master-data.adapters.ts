import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import {
  fromIsoDate,
  toIsoDate,
  type IsoDate,
} from '../../../../shared/domain';
import {
  CheckPostingDateUseCase,
  CloseFiscalYearUseCase as MasterDataCloseFiscalYearUseCase,
  LockPeriodUseCase,
} from '../../../master-data';
import { GlPostingPeriodClosedError } from '../domain';
import type {
  FiscalYearView,
  LedgerPeriods,
  LedgerPostingGate,
} from '../application/ports';

@Injectable()
export class MasterDataLedgerPostingGate implements LedgerPostingGate {
  constructor(private readonly check: CheckPostingDateUseCase) {}
  async assertOpen(companyId: string, date: IsoDate): Promise<void> {
    const r = await this.check.execute({ companyId, date });
    if (!r.allowed)
      throw new GlPostingPeriodClosedError(companyId, date, r.reason);
  }
}

interface YearRow {
  id: string;
  companyId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status: string;
  periods: ReadonlyArray<{
    periodNo: number;
    startDate: Date;
    endDate: Date;
    status: string;
  }>;
}

function toView(r: YearRow): FiscalYearView {
  return {
    id: r.id,
    companyId: r.companyId,
    name: r.name,
    startDate: toIsoDate(r.startDate),
    endDate: toIsoDate(r.endDate),
    status: r.status,
    periods: [...r.periods]
      .sort((a, b) => a.periodNo - b.periodNo)
      .map((p) => ({
        fiscalYearId: r.id,
        periodNo: p.periodNo,
        startDate: toIsoDate(p.startDate),
        endDate: toIsoDate(p.endDate),
        status: p.status,
      })),
  };
}

const withPeriods = { periods: { orderBy: { periodNo: 'asc' as const } } };

/**
 * Reads fiscal years directly; the two writes go through master-data's
 * use cases so its transition rules (locked ↔ open, close once) hold.
 */
@Injectable()
export class MasterDataLedgerPeriods implements LedgerPeriods {
  constructor(
    private readonly txm: PrismaTransactionManager,
    private readonly lock: LockPeriodUseCase,
    private readonly close: MasterDataCloseFiscalYearUseCase,
  ) {}

  async findYearCovering(
    tenantId: string,
    companyId: string,
    date: IsoDate,
  ): Promise<FiscalYearView | null> {
    const d = fromIsoDate(date);
    const r = await this.txm.getClient().fiscalYear.findFirst({
      where: {
        tenantId,
        companyId,
        startDate: { lte: d },
        endDate: { gte: d },
      },
      include: withPeriods,
    });
    return r ? toView(r) : null;
  }

  async findYear(
    tenantId: string,
    fiscalYearId: string,
  ): Promise<FiscalYearView | null> {
    const r = await this.txm.getClient().fiscalYear.findFirst({
      where: { id: fiscalYearId, tenantId },
      include: withPeriods,
    });
    return r ? toView(r) : null;
  }

  async lockPeriod(
    fiscalYearId: string,
    periodNo: number,
    reason: string,
  ): Promise<void> {
    await this.lock.execute({ fiscalYearId, periodNo, reason });
  }

  async closeYear(fiscalYearId: string): Promise<void> {
    await this.close.execute(fiscalYearId);
  }
}
