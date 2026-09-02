import { Inject, Injectable } from '@nestjs/common';

import {
  addDays,
  assertIsoDate,
  type IsoDate,
} from '../../../../shared/domain';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  GlRefInvalidError,
  InvalidJournalEntryError,
  buildBalanceSheet,
  buildProfitAndLoss,
  buildTrialBalance,
  type BalanceSheet,
  type ProfitAndLoss,
  type TrialBalance,
} from '../domain';

import {
  LEDGER_BALANCE_QUERY,
  LEDGER_REF_LOOKUP,
  type LedgerBalanceQuery,
  type LedgerRefLookup,
} from './ports';

export interface RangeReportInput {
  readonly companyId: string;
  readonly from: IsoDate;
  readonly to: IsoDate;
}

abstract class LedgerReport {
  constructor(
    protected readonly balances: LedgerBalanceQuery,
    protected readonly refs: LedgerRefLookup,
    protected readonly tenant: TenantContext,
  ) {}
  protected async requireCompany(companyId: string): Promise<string> {
    const c = await this.refs.findCompany(this.tenant.getTenantId(), companyId);
    if (!c) throw new GlRefInvalidError(`company ${companyId} does not exist`);
    return c.id;
  }
  protected range(input: RangeReportInput): [IsoDate, IsoDate] {
    const from = assertIsoDate(input.from, 'from');
    const to = assertIsoDate(input.to, 'to');
    if (from > to) throw new InvalidJournalEntryError('from must be <= to');
    return [from, to];
  }
}

/** T-353 */
@Injectable()
export class TrialBalanceUseCase extends LedgerReport {
  constructor(
    @Inject(LEDGER_BALANCE_QUERY) balances: LedgerBalanceQuery,
    @Inject(LEDGER_REF_LOOKUP) refs: LedgerRefLookup,
    @Inject(TENANT_CONTEXT) tenant: TenantContext,
  ) {
    super(balances, refs, tenant);
  }
  async execute(input: RangeReportInput): Promise<TrialBalance> {
    const tenantId = this.tenant.getTenantId();
    const companyId = await this.requireCompany(input.companyId);
    const [from, to] = this.range(input);
    const [accounts, opening, period] = await Promise.all([
      this.refs.listAccounts(tenantId),
      this.balances.sumByAccount(tenantId, companyId, null, addDays(from, -1)),
      this.balances.sumByAccount(tenantId, companyId, from, to),
    ]);
    return buildTrialBalance(from, to, accounts, opening, period);
  }
}

/** T-354 */
@Injectable()
export class ProfitAndLossUseCase extends LedgerReport {
  constructor(
    @Inject(LEDGER_BALANCE_QUERY) balances: LedgerBalanceQuery,
    @Inject(LEDGER_REF_LOOKUP) refs: LedgerRefLookup,
    @Inject(TENANT_CONTEXT) tenant: TenantContext,
  ) {
    super(balances, refs, tenant);
  }
  async execute(input: RangeReportInput): Promise<ProfitAndLoss> {
    const tenantId = this.tenant.getTenantId();
    const companyId = await this.requireCompany(input.companyId);
    const [from, to] = this.range(input);
    const [accounts, period] = await Promise.all([
      this.refs.listAccounts(tenantId),
      this.balances.sumByAccount(tenantId, companyId, from, to),
    ]);
    return buildProfitAndLoss(from, to, accounts, period);
  }
}

export interface AsOfReportInput {
  readonly companyId: string;
  readonly asOf: IsoDate;
}

/** T-355 */
@Injectable()
export class BalanceSheetUseCase extends LedgerReport {
  constructor(
    @Inject(LEDGER_BALANCE_QUERY) balances: LedgerBalanceQuery,
    @Inject(LEDGER_REF_LOOKUP) refs: LedgerRefLookup,
    @Inject(TENANT_CONTEXT) tenant: TenantContext,
  ) {
    super(balances, refs, tenant);
  }
  async execute(input: AsOfReportInput): Promise<BalanceSheet> {
    const tenantId = this.tenant.getTenantId();
    const companyId = await this.requireCompany(input.companyId);
    const asOf = assertIsoDate(input.asOf, 'asOf');
    const [accounts, cumulative] = await Promise.all([
      this.refs.listAccounts(tenantId),
      this.balances.sumByAccount(tenantId, companyId, null, asOf),
    ]);
    return buildBalanceSheet(asOf, accounts, cumulative);
  }
}
