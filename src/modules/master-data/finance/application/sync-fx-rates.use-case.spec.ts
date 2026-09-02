import { Currency, FxRate, FxRateSource } from '../domain';

import { SyncFxRatesUseCase } from './sync-fx-rates.use-case';
import {
  FixedClock,
  InMemoryCurrencyRepository,
  InMemoryFxRateRepository,
  StubFxRateSource,
  StubTenantDirectory,
} from './testing/in-memory';

describe('SyncFxRatesUseCase', () => {
  const now = new Date('2026-09-01T11:30:00.000Z');
  let currencies: InMemoryCurrencyRepository;
  let rates: InMemoryFxRateRepository;

  const cur = (tenantId: string, code: string): Currency =>
    Currency.create({
      id: `${tenantId}-${code}`,
      tenantId,
      code,
      name: code,
      now,
    });

  beforeEach(() => {
    currencies = new InMemoryCurrencyRepository();
    rates = new InMemoryFxRateRepository();
    for (const t of ['t1', 't2']) {
      currencies.rows.push(cur(t, 'THB'), cur(t, 'USD'));
    }
    currencies.rows.push(cur('t1', 'JPY'), cur('t2', 'EUR'));
  });

  const run = (source: StubFxRateSource, tenantIds?: readonly string[]) =>
    new SyncFxRatesUseCase(
      source,
      rates,
      currencies,
      new StubTenantDirectory(['t1', 't2']),
      new FixedClock(now),
    ).execute({ rateDate: '2026-09-01', tenantIds: tenantIds ?? null });

  it('fetches once, fans out per tenant, skips THB, reports unquoted currencies', async () => {
    const source = new StubFxRateSource([
      { quoteCurrency: 'USD', rateDate: '2026-09-01', rateScaled: 33_123_400n },
      { quoteCurrency: 'JPY', rateDate: '2026-09-01', rateScaled: 225_000n },
    ]);
    const r = await run(source);
    expect(source.calls).toBe(1);
    expect(r).toMatchObject({
      published: true,
      tenantsProcessed: 2,
      upserted: 3, // t1: USD, JPY; t2: USD
      skippedManual: 0,
      missingQuotes: ['EUR'],
    });
    const t2usd = await rates.findExact('t2', 'THB', 'USD', '2026-09-01');
    expect(t2usd?.snapshot()).toMatchObject({
      source: 'BOT',
      rateScaled: 33_123_400n,
    });
  });

  it('never overwrites a MANUAL rate for the same day', async () => {
    await rates.upsert(
      FxRate.create({
        id: 'm',
        tenantId: 't1',
        baseCurrency: 'THB',
        quoteCurrency: 'USD',
        rateDate: '2026-09-01',
        rateScaled: 33_000_000n,
        source: FxRateSource.Manual,
        fetchedAt: now,
        createdBy: 'acct',
      }),
    );
    const r = await run(
      new StubFxRateSource([
        {
          quoteCurrency: 'USD',
          rateDate: '2026-09-01',
          rateScaled: 33_123_400n,
        },
      ]),
      ['t1'],
    );
    expect(r).toMatchObject({ upserted: 0, skippedManual: 1 });
    expect(
      (await rates.findExact('t1', 'THB', 'USD', '2026-09-01'))?.snapshot()
        .rateScaled,
    ).toBe(33_000_000n);
  });

  it('a non-business day yields nothing and no missing-quote noise', async () => {
    const r = await run(new StubFxRateSource([]));
    expect(r).toMatchObject({
      published: false,
      upserted: 0,
      missingQuotes: [],
    });
  });
});
