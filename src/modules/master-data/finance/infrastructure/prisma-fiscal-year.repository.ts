import { Injectable } from '@nestjs/common';

import { PrismaTransactionManager } from '../../../../shared/database';
import {
  FiscalYear,
  isFiscalPeriodStatus,
  isFiscalYearStatus,
  type FiscalPeriodSnapshot,
  type FiscalYearSnapshot,
  type IsoDate,
} from '../domain';
import type { FiscalYearRepository } from '../application/ports/fiscal-year.repository';

import { dateFromDb, dateToDb } from './date-mapping';

const withPeriods = { periods: { orderBy: { periodNo: 'asc' as const } } };

@Injectable()
export class PrismaFiscalYearRepository implements FiscalYearRepository {
  constructor(private readonly txm: PrismaTransactionManager) {}

  async findById(tenantId: string, id: string): Promise<FiscalYear | null> {
    const row = await this.txm
      .getClient()
      .fiscalYear.findFirst({ where: { tenantId, id }, include: withPeriods });
    return row ? FiscalYear.fromSnapshot(toSnapshot(row)) : null;
  }

  async findByName(
    tenantId: string,
    companyId: string,
    name: string,
  ): Promise<FiscalYear | null> {
    const row = await this.txm.getClient().fiscalYear.findFirst({
      where: { tenantId, companyId, name },
      include: withPeriods,
    });
    return row ? FiscalYear.fromSnapshot(toSnapshot(row)) : null;
  }

  async listForCompany(
    tenantId: string,
    companyId: string,
  ): Promise<readonly FiscalYear[]> {
    const rows = await this.txm.getClient().fiscalYear.findMany({
      where: { tenantId, companyId },
      include: withPeriods,
      orderBy: { startDate: 'desc' },
    });
    return rows.map((r) => FiscalYear.fromSnapshot(toSnapshot(r)));
  }

  async findCovering(
    tenantId: string,
    companyId: string,
    date: IsoDate,
  ): Promise<FiscalYear | null> {
    const d = dateToDb(date);
    const row = await this.txm.getClient().fiscalYear.findFirst({
      where: {
        tenantId,
        companyId,
        startDate: { lte: d },
        endDate: { gte: d },
      },
      include: withPeriods,
    });
    return row ? FiscalYear.fromSnapshot(toSnapshot(row)) : null;
  }

  async findOverlapping(
    tenantId: string,
    companyId: string,
    startDate: IsoDate,
    endDate: IsoDate,
  ): Promise<FiscalYear | null> {
    const row = await this.txm.getClient().fiscalYear.findFirst({
      where: {
        tenantId,
        companyId,
        startDate: { lte: dateToDb(endDate) },
        endDate: { gte: dateToDb(startDate) },
      },
      include: withPeriods,
    });
    return row ? FiscalYear.fromSnapshot(toSnapshot(row)) : null;
  }

  async create(year: FiscalYear): Promise<void> {
    const s = year.snapshot();
    await this.txm.getClient().fiscalYear.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        companyId: s.companyId,
        name: s.name,
        startDate: dateToDb(s.startDate),
        endDate: dateToDb(s.endDate),
        status: s.status,
        closedAt: s.closedAt,
        closedBy: s.closedBy,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        periods: { create: s.periods.map(periodRow) },
      },
    });
  }

  async save(year: FiscalYear): Promise<void> {
    const s = year.snapshot();
    const db = this.txm.getClient();
    await db.fiscalYear.update({
      where: { id: s.id, tenantId: s.tenantId },
      data: {
        status: s.status,
        closedAt: s.closedAt,
        closedBy: s.closedBy,
        updatedAt: s.updatedAt,
      },
    });
    for (const p of s.periods) {
      await db.fiscalPeriod.update({
        where: { id: p.id, tenantId: p.tenantId },
        data: {
          status: p.status,
          lockedAt: p.lockedAt,
          lockedBy: p.lockedBy,
          lockReason: p.lockReason,
          updatedAt: p.updatedAt,
        },
      });
    }
  }
}

function periodRow(p: FiscalPeriodSnapshot): {
  id: string;
  tenantId: string;
  periodNo: number;
  startDate: Date;
  endDate: Date;
  status: string;
  lockedAt: Date | null;
  lockedBy: string | null;
  lockReason: string | null;
  updatedAt: Date;
} {
  return {
    id: p.id,
    tenantId: p.tenantId,
    periodNo: p.periodNo,
    startDate: dateToDb(p.startDate),
    endDate: dateToDb(p.endDate),
    status: p.status,
    lockedAt: p.lockedAt,
    lockedBy: p.lockedBy,
    lockReason: p.lockReason,
    updatedAt: p.updatedAt,
  };
}

function toSnapshot(row: {
  id: string;
  tenantId: string;
  companyId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status: string;
  closedAt: Date | null;
  closedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  periods: readonly {
    id: string;
    tenantId: string;
    fiscalYearId: string;
    periodNo: number;
    startDate: Date;
    endDate: Date;
    status: string;
    lockedAt: Date | null;
    lockedBy: string | null;
    lockReason: string | null;
    updatedAt: Date;
  }[];
}): FiscalYearSnapshot {
  if (!isFiscalYearStatus(row.status))
    throw new Error(
      `fin_fiscal_year.status holds unknown value "${row.status}"`,
    );
  const periods: FiscalPeriodSnapshot[] = row.periods.map((p) => {
    if (!isFiscalPeriodStatus(p.status))
      throw new Error(
        `fin_fiscal_period.status holds unknown value "${p.status}"`,
      );
    return {
      id: p.id,
      tenantId: p.tenantId,
      fiscalYearId: p.fiscalYearId,
      periodNo: p.periodNo,
      startDate: dateFromDb(p.startDate),
      endDate: dateFromDb(p.endDate),
      status: p.status,
      lockedAt: p.lockedAt,
      lockedBy: p.lockedBy,
      lockReason: p.lockReason,
      updatedAt: p.updatedAt,
    };
  });
  return {
    id: row.id,
    tenantId: row.tenantId,
    companyId: row.companyId,
    name: row.name,
    startDate: dateFromDb(row.startDate),
    endDate: dateFromDb(row.endDate),
    status: row.status,
    closedAt: row.closedAt,
    closedBy: row.closedBy,
    periods,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
