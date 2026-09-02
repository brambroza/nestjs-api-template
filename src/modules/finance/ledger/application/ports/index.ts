import type { IsoDate } from '../../../../../shared/domain';
import type {
  AccountInfo,
  AccountMappingSnapshot,
  AccountSum,
  GlEvent,
  JournalEntry,
  JournalEntryStatus,
  JournalSourceType,
} from '../../domain';

export const JOURNAL_ENTRY_REPOSITORY = Symbol('JOURNAL_ENTRY_REPOSITORY');
export const ACCOUNT_MAPPING_REPOSITORY = Symbol('ACCOUNT_MAPPING_REPOSITORY');
export const LEDGER_BALANCE_QUERY = Symbol('LEDGER_BALANCE_QUERY');
export const LEDGER_REF_LOOKUP = Symbol('LEDGER_REF_LOOKUP');
export const LEDGER_POSTING_GATE = Symbol('LEDGER_POSTING_GATE');
export const LEDGER_PERIODS = Symbol('LEDGER_PERIODS');
export const GL_OUTBOX = Symbol('GL_OUTBOX');

export interface JournalFilter {
  readonly companyId?: string | null;
  readonly status?: JournalEntryStatus | null;
  readonly sourceType?: JournalSourceType | null;
  readonly accountId?: string | null;
  readonly from?: IsoDate | null;
  readonly to?: IsoDate | null;
  readonly limit: number;
  readonly offset: number;
}

export interface JournalEntryRepository {
  findById(tenantId: string, id: string): Promise<JournalEntry | null>;
  findBySourceKey(
    tenantId: string,
    sourceKey: string,
  ): Promise<JournalEntry | null>;
  /** POSTED, not yet reversed, original (non-reversal) entries of one source document. */
  listPostedForSource(
    tenantId: string,
    sourceType: JournalSourceType,
    sourceId: string,
  ): Promise<readonly JournalEntry[]>;
  list(
    tenantId: string,
    f: JournalFilter,
  ): Promise<{
    readonly items: readonly JournalEntry[];
    readonly total: number;
  }>;
  /** DRAFT / PENDING_APPROVAL entries dated inside [from, to]. */
  countUnposted(
    tenantId: string,
    companyId: string,
    from: IsoDate,
    to: IsoDate,
  ): Promise<number>;
  create(e: JournalEntry): Promise<void>;
  save(e: JournalEntry): Promise<JournalEntry>;
}

export interface AccountMappingRepository {
  listForCompany(
    tenantId: string,
    companyId: string,
  ): Promise<readonly AccountMappingSnapshot[]>;
  upsert(m: AccountMappingSnapshot): Promise<void>;
}

/** Sums of POSTED/REVERSED lines per account; `from` null = since inception. */
export interface LedgerBalanceQuery {
  sumByAccount(
    tenantId: string,
    companyId: string,
    from: IsoDate | null,
    to: IsoDate,
  ): Promise<readonly AccountSum[]>;
}

export interface LedgerCompanyRef {
  readonly id: string;
  readonly legalName: string;
  readonly baseCurrency: string;
  readonly isActive: boolean;
}

export interface LedgerRefLookup {
  findCompany(tenantId: string, id: string): Promise<LedgerCompanyRef | null>;
  listAccounts(tenantId: string): Promise<readonly AccountInfo[]>;
  findAccount(tenantId: string, id: string): Promise<AccountInfo | null>;
  findAccountByCode(
    tenantId: string,
    code: string,
  ): Promise<AccountInfo | null>;
}

/** Wraps master-data's CheckPostingDate: throws GlPostingPeriodClosedError. */
export interface LedgerPostingGate {
  assertOpen(companyId: string, date: IsoDate): Promise<void>;
}

export interface FiscalPeriodView {
  readonly fiscalYearId: string;
  readonly periodNo: number;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly status: string;
}
export interface FiscalYearView {
  readonly id: string;
  readonly companyId: string;
  readonly name: string;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly status: string;
  readonly periods: readonly FiscalPeriodView[];
}

/** Period reads and the two writes the close needs, delegated to master-data. */
export interface LedgerPeriods {
  findYearCovering(
    tenantId: string,
    companyId: string,
    date: IsoDate,
  ): Promise<FiscalYearView | null>;
  findYear(
    tenantId: string,
    fiscalYearId: string,
  ): Promise<FiscalYearView | null>;
  lockPeriod(
    fiscalYearId: string,
    periodNo: number,
    reason: string,
  ): Promise<void>;
  closeYear(fiscalYearId: string): Promise<void>;
}

export interface GlOutboxEnvelope {
  readonly idempotencyKey: string;
  readonly event: GlEvent;
}
export interface GlOutbox {
  enqueue(envelope: GlOutboxEnvelope): Promise<void>;
}
