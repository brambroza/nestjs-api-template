import {
  FiscalYearCompanyInvalidError,
  FiscalYearOverlapError,
} from '../domain';

import {
  CheckPostingDateUseCase,
  CloseFiscalYearUseCase,
  CreateFiscalYearUseCase,
  LockPeriodUseCase,
  UnlockPeriodUseCase,
} from './fiscal-year.use-cases';
import {
  AutocommitTransactionManager,
  FixedClock,
  FixedTenantContext,
  InMemoryFiscalYearRepository,
  StubFinanceRefLookup,
} from './testing/in-memory';

describe('fiscal year use cases', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');
  let repo: InMemoryFiscalYearRepository;
  let tx: AutocommitTransactionManager;
  let create: CreateFiscalYearUseCase;
  let lock: LockPeriodUseCase;
  let unlock: UnlockPeriodUseCase;
  let close: CloseFiscalYearUseCase;
  let check: CheckPostingDateUseCase;

  beforeEach(() => {
    repo = new InMemoryFiscalYearRepository();
    tx = new AutocommitTransactionManager();
    const tenant = new FixedTenantContext('t', 'cfo');
    const clock = new FixedClock(now);
    const refs = new StubFinanceRefLookup([], ['co']);
    create = new CreateFiscalYearUseCase(repo, refs, tenant, clock);
    lock = new LockPeriodUseCase(repo, tx, tenant, clock);
    unlock = new UnlockPeriodUseCase(repo, tx, tenant, clock);
    close = new CloseFiscalYearUseCase(repo, tx, tenant, clock);
    check = new CheckPostingDateUseCase(repo, tenant);
  });

  it('creates 12 periods, refuses overlap and unknown company', async () => {
    const fy = await create.execute({
      companyId: 'co',
      name: 'FY2026',
      startDate: '2026-01-01',
    });
    expect(fy.snapshot().periods).toHaveLength(12);
    await expect(
      create.execute({
        companyId: 'co',
        name: 'FY2026b',
        startDate: '2026-07-01',
      }),
    ).rejects.toThrow(FiscalYearOverlapError);
    await expect(
      create.execute({
        companyId: 'co',
        name: 'FY2027',
        startDate: '2027-01-01',
      }),
    ).resolves.toBeDefined();
    await expect(
      create.execute({
        companyId: 'ghost',
        name: 'x',
        startDate: '2030-01-01',
      }),
    ).rejects.toThrow(FiscalYearCompanyInvalidError);
  });

  it('posting check reflects lock/unlock/close, each inside a transaction', async () => {
    const fy = await create.execute({
      companyId: 'co',
      name: 'FY2026',
      startDate: '2026-01-01',
    });
    const id = fy.snapshot().id;

    expect(
      await check.execute({ companyId: 'co', date: '2026-03-15' }),
    ).toMatchObject({ allowed: true, periodNo: 3 });
    expect(
      await check.execute({ companyId: 'co', date: '2025-03-15' }),
    ).toMatchObject({ allowed: false, reason: 'NO_FISCAL_YEAR' });

    await lock.execute({ fiscalYearId: id, periodNo: 3, reason: 'month end' });
    expect(
      await check.execute({ companyId: 'co', date: '2026-03-15' }),
    ).toMatchObject({ allowed: false, reason: 'PERIOD_LOCKED' });
    expect(repo.rows.get(id)?.snapshot().periods[2]?.lockedBy).toBe('cfo');

    await unlock.execute({
      fiscalYearId: id,
      periodNo: 3,
      reason: 'late supplier invoice',
    });
    expect(
      (await check.execute({ companyId: 'co', date: '2026-03-15' })).allowed,
    ).toBe(true);

    for (let n = 1; n <= 12; n++)
      await lock.execute({ fiscalYearId: id, periodNo: n });
    await close.execute(id);
    expect(
      await check.execute({ companyId: 'co', date: '2026-03-15' }),
    ).toMatchObject({ allowed: false, reason: 'YEAR_CLOSED' });
    expect(tx.calls).toBe(1 + 1 + 12 + 1);
  });
});
