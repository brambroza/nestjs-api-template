import {
  FiscalPeriodStatus,
  FiscalYear,
  FiscalYearClosedError,
  FiscalYearNotReadyToCloseError,
  FiscalYearStatus,
  generateMonthlyPeriods,
  IllegalPeriodTransitionError,
  InvalidFiscalYearFieldError,
} from './fiscal-year';

describe('generateMonthlyPeriods', () => {
  it('produces 12 contiguous calendar months incl. leap February', () => {
    const p = generateMonthlyPeriods('2028-01-01');
    expect(p).toHaveLength(12);
    expect(p[0]).toEqual({
      periodNo: 1,
      startDate: '2028-01-01',
      endDate: '2028-01-31',
    });
    expect(p[1]).toEqual({
      periodNo: 2,
      startDate: '2028-02-01',
      endDate: '2028-02-29',
    });
    expect(p[11]).toEqual({
      periodNo: 12,
      startDate: '2028-12-01',
      endDate: '2028-12-31',
    });
    for (let i = 1; i < 12; i++) {
      // no gaps, no overlaps
      expect((p[i]?.startDate ?? '') > (p[i - 1]?.endDate ?? '')).toBe(true);
    }
  });

  it('handles a non-calendar year (April start)', () => {
    const p = generateMonthlyPeriods('2026-04-01');
    expect(p[0]?.startDate).toBe('2026-04-01');
    expect(p[11]?.endDate).toBe('2027-03-31');
  });
});

describe('FiscalYear lifecycle', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');
  const ids = Array.from({ length: 12 }, (_, i) => `p${String(i + 1)}`);
  const make = (): FiscalYear =>
    FiscalYear.create({
      id: 'fy',
      tenantId: 't',
      companyId: 'co',
      name: 'FY2026',
      startDate: '2026-01-01',
      periodIds: ids,
      now,
    });

  it('creates OPEN with 12 OPEN periods and computes endDate', () => {
    const s = make().snapshot();
    expect(s.status).toBe(FiscalYearStatus.Open);
    expect(s.endDate).toBe('2026-12-31');
    expect(s.periods.every((p) => p.status === FiscalPeriodStatus.Open)).toBe(
      true,
    );
  });

  it('rejects a start that is not the 1st and a wrong id count', () => {
    expect(() =>
      FiscalYear.create({
        id: 'x',
        tenantId: 't',
        companyId: 'co',
        name: 'n',
        startDate: '2026-01-15',
        periodIds: ids,
        now,
      }),
    ).toThrow(InvalidFiscalYearFieldError);
    expect(() =>
      FiscalYear.create({
        id: 'x',
        tenantId: 't',
        companyId: 'co',
        name: 'n',
        startDate: '2026-01-01',
        periodIds: ids.slice(1),
        now,
      }),
    ).toThrow(InvalidFiscalYearFieldError);
  });

  it('overlap detection', () => {
    const fy = make();
    expect(fy.overlaps('2026-12-01', '2027-11-30')).toBe(true);
    expect(fy.overlaps('2027-01-01', '2027-12-31')).toBe(false);
  });

  it('lock -> unlock (reason required) -> lock; posting check follows', () => {
    const later = new Date('2026-10-05T00:00:00.000Z');
    let fy = make();
    expect(fy.postingCheck('2026-09-15')).toMatchObject({
      allowed: true,
      reason: 'OK',
      periodNo: 9,
    });

    fy = fy.lockPeriod(9, 'acct', later, 'month-end');
    const p9 = fy.snapshot().periods[8];
    expect(p9).toMatchObject({
      status: 'LOCKED',
      lockedBy: 'acct',
      lockReason: 'month-end',
    });
    expect(fy.postingCheck('2026-09-15')).toMatchObject({
      allowed: false,
      reason: 'PERIOD_LOCKED',
    });
    expect(fy.postingCheck('2026-10-01').allowed).toBe(true);

    expect(() => fy.lockPeriod(9, 'acct', later, null)).toThrow(
      IllegalPeriodTransitionError,
    );
    expect(() => fy.unlockPeriod(9, 'cfo', later, '   ')).toThrow(
      InvalidFiscalYearFieldError,
    );
    fy = fy.unlockPeriod(9, 'cfo', later, 'late invoice');
    expect(fy.snapshot().periods[8]).toMatchObject({
      status: 'OPEN',
      lockedBy: null,
      lockReason: 'late invoice',
    });
    expect(fy.postingCheck('2027-01-01')).toMatchObject({
      allowed: false,
      reason: 'NO_FISCAL_YEAR',
    });
  });

  it('close requires every period locked, then freezes everything', () => {
    const later = new Date('2027-01-10T00:00:00.000Z');
    let fy = make();
    expect(() => fy.close('cfo', later)).toThrow(
      FiscalYearNotReadyToCloseError,
    );
    for (let n = 1; n <= 12; n++) fy = fy.lockPeriod(n, 'acct', later, null);
    fy = fy.close('cfo', later);
    const s = fy.snapshot();
    expect(s.status).toBe(FiscalYearStatus.Closed);
    expect(s.closedBy).toBe('cfo');
    expect(s.periods.every((p) => p.status === FiscalPeriodStatus.Closed)).toBe(
      true,
    );
    expect(fy.postingCheck('2026-06-01')).toMatchObject({
      allowed: false,
      reason: 'YEAR_CLOSED',
    });
    expect(() => fy.unlockPeriod(1, 'cfo', later, 'oops')).toThrow(
      FiscalYearClosedError,
    );
    expect(() => fy.close('cfo', later)).toThrow(FiscalYearClosedError);
  });
});
