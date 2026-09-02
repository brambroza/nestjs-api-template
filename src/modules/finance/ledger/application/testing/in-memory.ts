import type { Clock } from '../../../../../shared/clock';
import type { IsoDate } from '../../../../../shared/domain';
import type { DocumentNumberGenerator } from '../../../../../shared/sequence';
import type { TenantContext } from '../../../../../shared/tenant';
import type { TransactionManager } from '../../../../../shared/transaction';
import type {
  ApprovalGateway,
  ApprovalStateView,
  ApprovalSubmitInput,
} from '../../../../approval';
import {
  GlPostingPeriodClosedError,
  GlVersionConflictError,
  JournalEntry,
  POSTED_STATUSES,
  type AccountInfo,
  type AccountMappingSnapshot,
  type AccountSum,
  type JournalSourceType,
} from '../../domain';
import type {
  AccountMappingRepository,
  FiscalYearView,
  GlOutbox,
  GlOutboxEnvelope,
  JournalEntryRepository,
  JournalFilter,
  LedgerBalanceQuery,
  LedgerCompanyRef,
  LedgerPeriods,
  LedgerPostingGate,
  LedgerRefLookup,
} from '../ports';

export class InMemoryJournalEntries implements JournalEntryRepository {
  readonly rows = new Map<string, JournalEntry>();
  private all(t: string): JournalEntry[] {
    return [...this.rows.values()].filter((e) => e.snapshot().tenantId === t);
  }
  async findById(t: string, id: string) {
    const e = this.rows.get(id);
    return e && e.snapshot().tenantId === t ? e : null;
  }
  async findBySourceKey(t: string, key: string) {
    return this.all(t).find((e) => e.snapshot().sourceKey === key) ?? null;
  }
  async listPostedForSource(
    t: string,
    sourceType: JournalSourceType,
    sourceId: string,
  ) {
    return this.all(t).filter(
      (e) =>
        e.status === 'POSTED' &&
        e.snapshot().reversalOfId === null &&
        e.snapshot().sourceType === sourceType &&
        e.snapshot().sourceId === sourceId,
    );
  }
  async list(t: string, f: JournalFilter) {
    const items = this.all(t).filter(
      (e) =>
        (!f.companyId || e.snapshot().companyId === f.companyId) &&
        (!f.status || e.status === f.status),
    );
    return {
      items: items.slice(f.offset, f.offset + f.limit),
      total: items.length,
    };
  }
  async countUnposted(
    t: string,
    companyId: string,
    from: IsoDate,
    to: IsoDate,
  ) {
    return this.all(t).filter((e) => {
      const s = e.snapshot();
      return (
        s.companyId === companyId &&
        (s.status === 'DRAFT' || s.status === 'PENDING_APPROVAL') &&
        s.entryDate >= from &&
        s.entryDate <= to
      );
    }).length;
  }
  async create(e: JournalEntry) {
    this.rows.set(e.id, e);
  }
  async save(e: JournalEntry) {
    const cur = this.rows.get(e.id);
    if (!cur) throw new Error('missing');
    if (cur.version !== e.version)
      throw new GlVersionConflictError(e.id, e.version, cur.version);
    const next = JournalEntry.hydrate({
      ...e.snapshot(),
      version: e.version + 1,
    });
    this.rows.set(e.id, next);
    return next;
  }
}

export class InMemoryMappings implements AccountMappingRepository {
  readonly rows = new Map<string, AccountMappingSnapshot>();
  async listForCompany(t: string, companyId: string) {
    return [...this.rows.values()].filter(
      (m) => m.tenantId === t && m.companyId === companyId,
    );
  }
  async upsert(m: AccountMappingSnapshot) {
    this.rows.set(`${m.companyId}:${m.key}`, m);
  }
}

/** Sums straight from the in-memory entries, like the Prisma groupBy does. */
export class InMemoryBalances implements LedgerBalanceQuery {
  constructor(private readonly entries: InMemoryJournalEntries) {}
  async sumByAccount(
    t: string,
    companyId: string,
    from: IsoDate | null,
    to: IsoDate,
  ): Promise<AccountSum[]> {
    const sums = new Map<string, { d: bigint; c: bigint }>();
    for (const e of this.entries.rows.values()) {
      const s = e.snapshot();
      if (
        s.tenantId !== t ||
        s.companyId !== companyId ||
        !POSTED_STATUSES.includes(s.status) ||
        (from !== null && s.entryDate < from) ||
        s.entryDate > to
      )
        continue;
      for (const l of s.lines) {
        const cur = sums.get(l.accountId) ?? { d: 0n, c: 0n };
        sums.set(l.accountId, {
          d: cur.d + l.debitMinor,
          c: cur.c + l.creditMinor,
        });
      }
    }
    return [...sums.entries()].map(([accountId, v]) => ({
      accountId,
      debitMinor: v.d,
      creditMinor: v.c,
    }));
  }
}

export class InMemoryLedgerRefLookup implements LedgerRefLookup {
  readonly companies = new Map<string, LedgerCompanyRef>();
  readonly accounts = new Map<string, AccountInfo>();
  async findCompany(_t: string, id: string) {
    return this.companies.get(id) ?? null;
  }
  async listAccounts() {
    return [...this.accounts.values()];
  }
  async findAccount(_t: string, id: string) {
    return this.accounts.get(id) ?? null;
  }
  async findAccountByCode(_t: string, code: string) {
    return [...this.accounts.values()].find((a) => a.code === code) ?? null;
  }
}

export class FakeLedgerGate implements LedgerPostingGate {
  closedBefore: IsoDate | null = null;
  async assertOpen(companyId: string, date: IsoDate) {
    if (this.closedBefore && date < this.closedBefore)
      throw new GlPostingPeriodClosedError(companyId, date, 'PERIOD_LOCKED');
  }
}

export class FakePeriods implements LedgerPeriods {
  readonly years = new Map<string, FiscalYearView>();
  readonly locked: string[] = [];
  readonly closed: string[] = [];
  async findYearCovering(_t: string, companyId: string, date: IsoDate) {
    return (
      [...this.years.values()].find(
        (y) =>
          y.companyId === companyId && y.startDate <= date && date <= y.endDate,
      ) ?? null
    );
  }
  async findYear(_t: string, id: string) {
    return this.years.get(id) ?? null;
  }
  async lockPeriod(fiscalYearId: string, periodNo: number) {
    this.locked.push(`${fiscalYearId}:${String(periodNo)}`);
    const y = this.years.get(fiscalYearId);
    if (y)
      this.years.set(fiscalYearId, {
        ...y,
        periods: y.periods.map((p) =>
          p.periodNo === periodNo ? { ...p, status: 'LOCKED' } : p,
        ),
      });
  }
  async closeYear(fiscalYearId: string) {
    this.closed.push(fiscalYearId);
  }
}

export class InMemoryGlOutbox implements GlOutbox {
  readonly rows: GlOutboxEnvelope[] = [];
  async enqueue(e: GlOutboxEnvelope) {
    this.rows.push(e);
  }
}

export class FakeApprovals implements ApprovalGateway {
  /** What `submit` answers; `stateOf` answers `state` afterwards. */
  submitStatus: 'APPROVED' | 'PENDING' = 'APPROVED';
  state: ApprovalStateView['status'] = 'NONE';
  readonly submitted: ApprovalSubmitInput[] = [];
  async submit(input: ApprovalSubmitInput) {
    this.submitted.push(input);
    if (this.submitStatus === 'PENDING') this.state = 'PENDING';
    return { requestId: 'req-1', status: this.submitStatus };
  }
  async stateOf(): Promise<ApprovalStateView> {
    return { status: this.state, requestId: 'req-1' };
  }
}

export class FakeNumbers implements DocumentNumberGenerator {
  private n = 0;
  async next(_t: string, prefix: string) {
    this.n += 1;
    return `${prefix}-202609-${String(this.n).padStart(4, '0')}`;
  }
}

export class FakeTx implements TransactionManager {
  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

export class FixedClock implements Clock {
  constructor(public current: Date) {}
  now(): Date {
    return this.current;
  }
}

export function tenantOf(tenantId: string, userId: string): TenantContext {
  return {
    getTenantId: () => tenantId,
    getUserId: () => userId,
    tryGetUserId: () => userId,
  };
}
