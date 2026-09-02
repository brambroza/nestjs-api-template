import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../../../shared/transaction';
import {
  DuplicateFiscalYearError,
  FiscalYear,
  FiscalYearCompanyInvalidError,
  FiscalYearNotFoundError,
  FiscalYearOverlapError,
  PERIODS_PER_YEAR,
  assertIsoDate,
  generateMonthlyPeriods,
  type IsoDate,
  type PostingCheck,
} from '../domain';

import {
  FINANCE_REF_LOOKUP,
  type FinanceRefLookup,
} from './ports/finance-ref-lookup.port';
import {
  FISCAL_YEAR_REPOSITORY,
  type FiscalYearRepository,
} from './ports/fiscal-year.repository';

async function requireCompany(
  refs: FinanceRefLookup,
  tenantId: string,
  companyId: string,
): Promise<void> {
  const c = await refs.findCompany(tenantId, companyId);
  if (!c || !c.isActive) throw new FiscalYearCompanyInvalidError(companyId);
}

export interface CreateFiscalYearInput {
  readonly companyId: string;
  readonly name: string;
  readonly startDate: IsoDate;
}

@Injectable()
export class CreateFiscalYearUseCase {
  constructor(
    @Inject(FISCAL_YEAR_REPOSITORY) private readonly repo: FiscalYearRepository,
    @Inject(FINANCE_REF_LOOKUP) private readonly refs: FinanceRefLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateFiscalYearInput): Promise<FiscalYear> {
    const tenantId = this.tenant.getTenantId();
    await requireCompany(this.refs, tenantId, input.companyId);
    const startDate = assertIsoDate(input.startDate, 'startDate');
    const periods = generateMonthlyPeriods(startDate);
    const endDate = periods[periods.length - 1]?.endDate ?? startDate;

    const [dup, overlap] = await Promise.all([
      this.repo.findByName(tenantId, input.companyId, input.name.trim()),
      this.repo.findOverlapping(tenantId, input.companyId, startDate, endDate),
    ]);
    if (dup) throw new DuplicateFiscalYearError(input.companyId, input.name);
    if (overlap) {
      throw new FiscalYearOverlapError(
        input.companyId,
        overlap.snapshot().name,
      );
    }
    const year = FiscalYear.create({
      id: randomUUID(),
      tenantId,
      companyId: input.companyId,
      name: input.name,
      startDate,
      periodIds: Array.from({ length: PERIODS_PER_YEAR }, () => randomUUID()),
      now: this.clock.now(),
    });
    await this.repo.create(year);
    return year;
  }
}

@Injectable()
export class GetFiscalYearUseCase {
  constructor(
    @Inject(FISCAL_YEAR_REPOSITORY) private readonly repo: FiscalYearRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(id: string): Promise<FiscalYear> {
    const found = await this.repo.findById(this.tenant.getTenantId(), id);
    if (!found) throw new FiscalYearNotFoundError(id);
    return found;
  }
}

@Injectable()
export class ListFiscalYearsUseCase {
  constructor(
    @Inject(FISCAL_YEAR_REPOSITORY) private readonly repo: FiscalYearRepository,
    @Inject(FINANCE_REF_LOOKUP) private readonly refs: FinanceRefLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(companyId: string): Promise<readonly FiscalYear[]> {
    const tenantId = this.tenant.getTenantId();
    await requireCompany(this.refs, tenantId, companyId);
    return this.repo.listForCompany(tenantId, companyId);
  }
}

export interface PeriodActionInput {
  readonly fiscalYearId: string;
  readonly periodNo: number;
  readonly reason?: string | null;
}

/** Lock / unlock / close all follow: load -> domain transition -> save, inside one tx. */
@Injectable()
export class LockPeriodUseCase {
  constructor(
    @Inject(FISCAL_YEAR_REPOSITORY) private readonly repo: FiscalYearRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: PeriodActionInput): Promise<FiscalYear> {
    const tenantId = this.tenant.getTenantId();
    return this.tx.runInTransaction(async () => {
      const year = await this.repo.findById(tenantId, input.fiscalYearId);
      if (!year) throw new FiscalYearNotFoundError(input.fiscalYearId);
      const next = year.lockPeriod(
        input.periodNo,
        this.tenant.getUserId(),
        this.clock.now(),
        input.reason ?? null,
      );
      await this.repo.save(next);
      return next;
    });
  }
}

@Injectable()
export class UnlockPeriodUseCase {
  constructor(
    @Inject(FISCAL_YEAR_REPOSITORY) private readonly repo: FiscalYearRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    input: PeriodActionInput & { readonly reason: string },
  ): Promise<FiscalYear> {
    const tenantId = this.tenant.getTenantId();
    return this.tx.runInTransaction(async () => {
      const year = await this.repo.findById(tenantId, input.fiscalYearId);
      if (!year) throw new FiscalYearNotFoundError(input.fiscalYearId);
      const next = year.unlockPeriod(
        input.periodNo,
        this.tenant.getUserId(),
        this.clock.now(),
        input.reason,
      );
      await this.repo.save(next);
      return next;
    });
  }
}

@Injectable()
export class CloseFiscalYearUseCase {
  constructor(
    @Inject(FISCAL_YEAR_REPOSITORY) private readonly repo: FiscalYearRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(fiscalYearId: string): Promise<FiscalYear> {
    const tenantId = this.tenant.getTenantId();
    return this.tx.runInTransaction(async () => {
      const year = await this.repo.findById(tenantId, fiscalYearId);
      if (!year) throw new FiscalYearNotFoundError(fiscalYearId);
      const next = year.close(this.tenant.getUserId(), this.clock.now());
      await this.repo.save(next);
      return next;
    });
  }
}

export interface CheckPostingDateInput {
  readonly companyId: string;
  readonly date: IsoDate;
}

/** The gate Phase C journals will call before writing a line. */
@Injectable()
export class CheckPostingDateUseCase {
  constructor(
    @Inject(FISCAL_YEAR_REPOSITORY) private readonly repo: FiscalYearRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(input: CheckPostingDateInput): Promise<PostingCheck> {
    const date = assertIsoDate(input.date, 'date');
    const year = await this.repo.findCovering(
      this.tenant.getTenantId(),
      input.companyId,
      date,
    );
    if (!year) {
      return {
        allowed: false,
        reason: 'NO_FISCAL_YEAR',
        fiscalYearId: null,
        periodNo: null,
        periodStatus: null,
      };
    }
    return year.postingCheck(date);
  }
}
