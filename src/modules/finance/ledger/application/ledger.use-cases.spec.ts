import {
  AccountKey,
  AccountMappingMissingError,
  JournalApprovalPendingError,
  PeriodHasUnpostedEntriesError,
  arInvoiceLines,
  type AccountInfo,
} from '../domain';

import {
  CreateJournalEntryUseCase,
  JournalWorkflow,
  PostJournalEntryUseCase,
  ReverseJournalEntryUseCase,
  SubmitJournalEntryUseCase,
  UpsertAccountMappingUseCase,
} from './journal.use-cases';
import { CloseFiscalYearUseCase, ClosePeriodUseCase } from './period.use-cases';
import { LedgerPostingService } from './posting.service';
import {
  BalanceSheetUseCase,
  ProfitAndLossUseCase,
  TrialBalanceUseCase,
} from './report.use-cases';
import {
  FakeApprovals,
  FakeLedgerGate,
  FakeNumbers,
  FakePeriods,
  FakeTx,
  FixedClock,
  InMemoryBalances,
  InMemoryGlOutbox,
  InMemoryJournalEntries,
  InMemoryLedgerRefLookup,
  InMemoryMappings,
  tenantOf,
} from './testing/in-memory';

function acc(id: string, code: string, type: AccountInfo['type']): AccountInfo {
  return {
    id,
    code,
    name: code,
    nameTh: null,
    type,
    isPostable: true,
    isActive: true,
  };
}

describe('Ledger use cases', () => {
  const tenant = tenantOf('t1', 'alice');
  const tx = new FakeTx();
  let entries: InMemoryJournalEntries;
  let mappings: InMemoryMappings;
  let refs: InMemoryLedgerRefLookup;
  let gate: FakeLedgerGate;
  let periods: FakePeriods;
  let outbox: InMemoryGlOutbox;
  let approvals: FakeApprovals;
  let clock: FixedClock;
  let posting: LedgerPostingService;
  let workflow: JournalWorkflow;
  let balances: InMemoryBalances;

  beforeEach(async () => {
    entries = new InMemoryJournalEntries();
    mappings = new InMemoryMappings();
    refs = new InMemoryLedgerRefLookup();
    gate = new FakeLedgerGate();
    periods = new FakePeriods();
    outbox = new InMemoryGlOutbox();
    approvals = new FakeApprovals();
    clock = new FixedClock(new Date('2026-09-02T03:00:00.000Z'));
    balances = new InMemoryBalances(entries);
    refs.companies.set('co', {
      id: 'co',
      legalName: 'Demo',
      baseCurrency: 'THB',
      isActive: true,
    });
    for (const a of [
      acc('a-bank', '1100', 'ASSET'),
      acc('a-ar', '1200', 'ASSET'),
      acc('a-vat', '2200', 'LIABILITY'),
      acc('a-re', '3200', 'EQUITY'),
      acc('a-rev', '4100', 'REVENUE'),
      acc('a-rent', '5300', 'EXPENSE'),
    ])
      refs.accounts.set(a.id, a);
    posting = new LedgerPostingService(
      entries,
      mappings,
      refs,
      gate,
      new FakeNumbers(),
      tenant,
      clock,
    );
    workflow = new JournalWorkflow(entries, approvals, gate, outbox, tenant);
    const upsert = new UpsertAccountMappingUseCase(
      mappings,
      refs,
      tx,
      tenant,
      clock,
    );
    await upsert.execute({
      companyId: 'co',
      key: 'AR_CONTROL',
      accountCode: '1200',
    });
    await upsert.execute({
      companyId: 'co',
      key: 'SALES_REVENUE',
      accountId: 'a-rev',
    });
    await upsert.execute({
      companyId: 'co',
      key: 'OUTPUT_VAT',
      accountId: 'a-vat',
    });
    await upsert.execute({
      companyId: 'co',
      key: 'RETAINED_EARNINGS',
      accountId: 'a-re',
    });
  });

  const invoiceRequest = (sourceId = 'inv-1') => ({
    companyId: 'co',
    entryDate: '2026-09-02',
    currency: 'THB',
    sourceType: 'AR_INVOICE' as const,
    sourceId,
    sourceKey: `${sourceId}:issued`,
    description: 'Invoice IV00000-202609-00001',
    lines: arInvoiceLines({
      kind: 'INVOICE',
      customerId: 'c1',
      netMinor: 10_000_00n,
      taxMinor: 700_00n,
      totalMinor: 10_700_00n,
    }),
  });

  it('gateway posts key-based lines as a POSTED entry, idempotent per sourceKey', async () => {
    const first = await posting.post(invoiceRequest());
    const again = await posting.post(invoiceRequest());
    expect(first?.created).toBe(true);
    expect(again).toMatchObject({ entryId: first?.entryId, created: false });
    const e = entries.rows.get(first?.entryId ?? '')?.snapshot();
    expect(e).toMatchObject({
      status: 'POSTED',
      number: 'JV-202609-0001',
      totalDebitMinor: 10_700_00n,
      postedBy: 'alice',
    });
    expect(e?.lines.map((l) => l.accountCode)).toEqual([
      '1200',
      '4100',
      '2200',
    ]);
  });

  it('refuses a posting key without a mapping and a locked period', async () => {
    await expect(
      posting.post({
        ...invoiceRequest('x'),
        lines: [
          { accountKey: AccountKey.Cogs, debitMinor: 1n, creditMinor: 0n },
          { accountKey: AccountKey.ArControl, debitMinor: 0n, creditMinor: 1n },
        ],
      }),
    ).rejects.toThrow(AccountMappingMissingError);
    gate.closedBefore = '2026-10-01';
    await expect(posting.post(invoiceRequest('y'))).rejects.toThrow(
      /Cannot post to 2026-09-02/,
    );
  });

  it('reverse mirrors every posted entry of the source and nets balances to zero', async () => {
    await posting.post(invoiceRequest());
    const r = await posting.reverse({
      sourceType: 'AR_INVOICE',
      sourceId: 'inv-1',
      entryDate: '2026-09-03',
      sourceKey: 'inv-1:voided',
      description: 'Void',
    });
    expect(r).toHaveLength(1);
    const statuses = [...entries.rows.values()].map((e) => e.status).sort();
    expect(statuses).toEqual(['POSTED', 'REVERSED']);
    const sums = await balances.sumByAccount('t1', 'co', null, '2026-09-30');
    for (const s of sums) expect(s.debitMinor).toBe(s.creditMinor);
    expect(
      await posting.reverse({
        sourceType: 'AR_INVOICE',
        sourceId: 'inv-1',
        entryDate: '2026-09-03',
        sourceKey: 'inv-1:voided-again',
        description: 'Void',
      }),
    ).toEqual([]);
  });

  it('manual JV: approval pending blocks posting; approved posts behind the gate and emits', async () => {
    const create = new CreateJournalEntryUseCase(
      entries,
      refs,
      new FakeNumbers(),
      tx,
      tenant,
      clock,
    );
    const draft = await create.execute({
      companyId: 'co',
      entryDate: '2026-09-05',
      description: 'Rent September',
      lines: [
        { accountCode: '5300', debitMinor: 20_000_00n, creditMinor: 0n },
        { accountId: 'a-bank', debitMinor: 0n, creditMinor: 20_000_00n },
      ],
    });
    expect(draft.status).toBe('DRAFT');
    approvals.submitStatus = 'PENDING';
    const submit = new SubmitJournalEntryUseCase(workflow, tx, clock);
    const pending = await submit.execute({ entryId: draft.id });
    expect(pending.status).toBe('PENDING_APPROVAL');
    expect(approvals.submitted[0]).toMatchObject({
      documentType: 'JOURNAL_ENTRY',
      amountMinor: 20_000_00n,
    });
    const post = new PostJournalEntryUseCase(workflow, tx, clock);
    await expect(post.execute({ entryId: draft.id })).rejects.toThrow(
      JournalApprovalPendingError,
    );
    approvals.state = 'APPROVED';
    const posted = await post.execute({ entryId: draft.id });
    expect(posted.status).toBe('POSTED');
    expect(outbox.rows.map((r) => r.event.type)).toEqual([
      'journal_entry.posted.v1',
    ]);
    const pl = await new ProfitAndLossUseCase(balances, refs, tenant).execute({
      companyId: 'co',
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(pl.expenses.totalMinor).toBe(20_000_00n);

    const reverse = new ReverseJournalEntryUseCase(
      workflow,
      posting,
      outbox,
      tx,
      tenant,
      clock,
    );
    const reversal = await reverse.execute({ entryId: posted.id });
    expect(reversal.snapshot().reversalOfId).toBe(posted.id);
    expect((await entries.findById('t1', posted.id))?.status).toBe('REVERSED');
  });

  it('rejected approval reopens the draft', async () => {
    const create = new CreateJournalEntryUseCase(
      entries,
      refs,
      new FakeNumbers(),
      tx,
      tenant,
      clock,
    );
    const draft = await create.execute({
      companyId: 'co',
      entryDate: '2026-09-05',
      description: 'x',
      lines: [
        { accountCode: '5300', debitMinor: 1n, creditMinor: 0n },
        { accountCode: '1100', debitMinor: 0n, creditMinor: 1n },
      ],
    });
    approvals.submitStatus = 'PENDING';
    await new SubmitJournalEntryUseCase(workflow, tx, clock).execute({
      entryId: draft.id,
    });
    approvals.state = 'REJECTED';
    const back = await new PostJournalEntryUseCase(workflow, tx, clock).execute(
      {
        entryId: draft.id,
      },
    );
    expect(back.status).toBe('DRAFT');
  });

  it('period close refuses unposted entries, then locks; year-end posts the closing entry and closes', async () => {
    periods.years.set('fy', {
      id: 'fy',
      companyId: 'co',
      name: 'FY2026',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'OPEN',
      periods: Array.from({ length: 12 }, (_, i) => {
        const m = String(i + 1).padStart(2, '0');
        const last = new Date(Date.UTC(2026, i + 1, 0)).getUTCDate();
        return {
          fiscalYearId: 'fy',
          periodNo: i + 1,
          startDate: `2026-${m}-01`,
          endDate: `2026-${m}-${String(last)}`,
          status: 'OPEN',
        };
      }),
    });
    await posting.post(invoiceRequest());
    const create = new CreateJournalEntryUseCase(
      entries,
      refs,
      new FakeNumbers(),
      tx,
      tenant,
      clock,
    );
    const draft = await create.execute({
      companyId: 'co',
      entryDate: '2026-09-20',
      description: 'late',
      lines: [
        { accountCode: '5300', debitMinor: 100n, creditMinor: 0n },
        { accountCode: '1100', debitMinor: 0n, creditMinor: 100n },
      ],
    });
    const closePeriod = new ClosePeriodUseCase(entries, periods, tx, tenant);
    await expect(
      closePeriod.execute({ companyId: 'co', date: '2026-09-15' }),
    ).rejects.toThrow(PeriodHasUnpostedEntriesError);
    await new SubmitJournalEntryUseCase(workflow, tx, clock).execute({
      entryId: draft.id,
    });
    const closed = await closePeriod.execute({
      companyId: 'co',
      date: '2026-09-15',
    });
    expect(closed).toMatchObject({ periodNo: 9, status: 'LOCKED' });
    expect(periods.locked).toEqual(['fy:9']);

    const closeYear = new CloseFiscalYearUseCase(
      entries,
      periods,
      balances,
      refs,
      posting,
      tx,
      tenant,
    );
    const r = await closeYear.execute('fy');
    expect(r.closingEntry?.snapshot()).toMatchObject({
      sourceType: 'YEAR_END_CLOSE',
      entryDate: '2026-12-31',
      status: 'POSTED',
    });
    const re = r.closingEntry
      ?.snapshot()
      .lines.find((l) => l.accountCode === '3200');
    expect(re?.creditMinor).toBe(10_000_00n - 100n);
    expect(periods.closed).toEqual(['fy']);
    expect(periods.locked).toHaveLength(12);
    // Re-running is idempotent: same closing entry, nothing new posted.
    const again = await closeYear.execute('fy');
    expect(again.closingEntry?.id).toBe(r.closingEntry?.id);

    const bs = await new BalanceSheetUseCase(balances, refs, tenant).execute({
      companyId: 'co',
      asOf: '2026-12-31',
    });
    expect(bs.currentEarningsMinor).toBe(0n);
    expect(bs.balanced).toBe(true);
    const tb = await new TrialBalanceUseCase(balances, refs, tenant).execute({
      companyId: 'co',
      from: '2026-12-01',
      to: '2026-12-31',
    });
    expect(tb.balanced).toBe(true);
    expect(tb.rows.find((row) => row.code === '1200')?.openingMinor).toBe(
      10_700_00n,
    );
  });
});
