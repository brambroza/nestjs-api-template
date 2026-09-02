import { Inject, Injectable } from '@nestjs/common';

import { assertIsoDate, type IsoDate } from '../../../../shared/domain';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../../../shared/transaction';
import {
  AccountKey,
  AccountMappingMissingError,
  FiscalPeriodNotFoundForDateError,
  GlRefInvalidError,
  JournalSourceType,
  PeriodHasUnpostedEntriesError,
  buildClosingLines,
  type JournalEntry,
} from '../domain';

import {
  JOURNAL_ENTRY_REPOSITORY,
  LEDGER_BALANCE_QUERY,
  LEDGER_PERIODS,
  LEDGER_REF_LOOKUP,
  type FiscalPeriodView,
  type JournalEntryRepository,
  type LedgerBalanceQuery,
  type LedgerPeriods,
  type LedgerRefLookup,
} from './ports';
import { LedgerPostingService } from './posting.service';

export const PERIOD_CLOSE_REASON = 'period-end close';

export interface ClosePeriodInput {
  readonly companyId: string;
  /** Any date inside the period to close. */
  readonly date: IsoDate;
}

/**
 * T-352 month-end: every journal entry dated in the period must be
 * posted (or void); the period is then locked through master-data so
 * AR/AP/inventory/GL all refuse further postings into it.
 */
@Injectable()
export class ClosePeriodUseCase {
  constructor(
    @Inject(JOURNAL_ENTRY_REPOSITORY)
    private readonly entries: JournalEntryRepository,
    @Inject(LEDGER_PERIODS) private readonly periods: LedgerPeriods,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(input: ClosePeriodInput): Promise<FiscalPeriodView> {
    const tenantId = this.tenant.getTenantId();
    const date = assertIsoDate(input.date, 'date');
    return this.tx.runInTransaction(async () => {
      const year = await this.periods.findYearCovering(
        tenantId,
        input.companyId,
        date,
      );
      const period = year?.periods.find(
        (p) => p.startDate <= date && date <= p.endDate,
      );
      if (!year || !period)
        throw new FiscalPeriodNotFoundForDateError(input.companyId, date);
      const unposted = await this.entries.countUnposted(
        tenantId,
        input.companyId,
        period.startDate,
        period.endDate,
      );
      if (unposted > 0)
        throw new PeriodHasUnpostedEntriesError(
          input.companyId,
          period.startDate,
          period.endDate,
          unposted,
        );
      await this.periods.lockPeriod(
        year.id,
        period.periodNo,
        PERIOD_CLOSE_REASON,
      );
      return { ...period, status: 'LOCKED' };
    });
  }
}

export interface CloseFiscalYearResult {
  readonly fiscalYearId: string;
  readonly closingEntry: JournalEntry | null;
}

/**
 * T-352 year-end: no unposted entries in the year, a closing entry moves
 * the P&L result to retained earnings (dated the last day, bypassing the
 * gate for locked periods), remaining open periods are locked and the
 * year is closed for good. Re-runnable: the closing entry is keyed.
 */
@Injectable()
export class CloseFiscalYearUseCase {
  constructor(
    @Inject(JOURNAL_ENTRY_REPOSITORY)
    private readonly entries: JournalEntryRepository,
    @Inject(LEDGER_PERIODS) private readonly periods: LedgerPeriods,
    @Inject(LEDGER_BALANCE_QUERY)
    private readonly balances: LedgerBalanceQuery,
    @Inject(LEDGER_REF_LOOKUP) private readonly refs: LedgerRefLookup,
    private readonly posting: LedgerPostingService,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(fiscalYearId: string): Promise<CloseFiscalYearResult> {
    const tenantId = this.tenant.getTenantId();
    return this.tx.runInTransaction(async () => {
      const year = await this.periods.findYear(tenantId, fiscalYearId);
      if (!year)
        throw new GlRefInvalidError(`fiscal year ${fiscalYearId} not found`);
      const unposted = await this.entries.countUnposted(
        tenantId,
        year.companyId,
        year.startDate,
        year.endDate,
      );
      if (unposted > 0)
        throw new PeriodHasUnpostedEntriesError(
          year.companyId,
          year.startDate,
          year.endDate,
          unposted,
        );
      const sourceKey = `year-end:${year.id}`;
      let closingEntry = await this.entries.findBySourceKey(
        tenantId,
        sourceKey,
      );
      if (!closingEntry) {
        const company = await this.refs.findCompany(tenantId, year.companyId);
        if (!company)
          throw new GlRefInvalidError(`company ${year.companyId} not found`);
        const retained = (
          await this.posting.mappingsOf(tenantId, year.companyId)
        ).get(AccountKey.RetainedEarnings);
        if (!retained)
          throw new AccountMappingMissingError(
            year.companyId,
            AccountKey.RetainedEarnings,
          );
        const lines = buildClosingLines(
          await this.refs.listAccounts(tenantId),
          await this.balances.sumByAccount(
            tenantId,
            year.companyId,
            null,
            year.endDate,
          ),
          retained,
        );
        if (lines.length > 0) {
          closingEntry = await this.posting.postEntry({
            companyId: year.companyId,
            entryDate: year.endDate,
            currency: company.baseCurrency,
            sourceType: JournalSourceType.YearEndClose,
            sourceId: year.id,
            sourceKey,
            description: `Year-end close ${year.name}`,
            lines,
            skipPeriodGate: true,
          });
        }
      }
      for (const p of year.periods) {
        if (p.status === 'OPEN')
          await this.periods.lockPeriod(year.id, p.periodNo, 'year-end close');
      }
      await this.periods.closeYear(year.id);
      return { fiscalYearId: year.id, closingEntry };
    });
  }
}
