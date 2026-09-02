import {
  convertFromBase,
  convertToBase,
  Currency,
  formatScaled,
  FxRate,
  InvalidCurrencyFieldError,
  InvalidFxRateError,
  parseDecimalToScaled,
  roundDiv,
} from './currency';

describe('Currency', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');
  it('normalises the code and validates minor units', () => {
    const c = Currency.create({
      id: 'c',
      tenantId: 't',
      code: 'thb',
      name: 'Baht',
      now,
    });
    expect(c.snapshot().code).toBe('THB');
    expect(c.snapshot().minorUnits).toBe(2);
    expect(() =>
      Currency.create({ id: 'c', tenantId: 't', code: 'TH', name: 'x', now }),
    ).toThrow(InvalidCurrencyFieldError);
    expect(() =>
      Currency.create({
        id: 'c',
        tenantId: 't',
        code: 'JPY',
        name: 'x',
        minorUnits: 5,
        now,
      }),
    ).toThrow(InvalidCurrencyFieldError);
  });
});

describe('FX scaled arithmetic (no float)', () => {
  it('parses decimal strings to 6-dp bigint, rounding half-up past 6 dp', () => {
    expect(parseDecimalToScaled('33.1234')).toBe(33_123_400n);
    expect(parseDecimalToScaled('33')).toBe(33_000_000n);
    expect(parseDecimalToScaled('0.2250')).toBe(225_000n);
    expect(parseDecimalToScaled('1.1234565')).toBe(1_123_457n);
    expect(parseDecimalToScaled('1.1234564')).toBe(1_123_456n);
    expect(() => parseDecimalToScaled('abc')).toThrow(InvalidFxRateError);
    expect(() => parseDecimalToScaled('-1')).toThrow(InvalidFxRateError);
  });

  it('formats back', () => {
    expect(formatScaled(33_123_400n)).toBe('33.123400');
    expect(formatScaled(225_000n)).toBe('0.225000');
  });

  it('roundDiv rounds half away from zero', () => {
    expect(roundDiv(5n, 2n)).toBe(3n);
    expect(roundDiv(4n, 2n)).toBe(2n);
    expect(roundDiv(-5n, 2n)).toBe(-3n);
    expect(roundDiv(7n, 3n)).toBe(2n);
  });

  it('converts USD cents to satang at 33.1234', () => {
    expect(
      convertToBase({
        amountQuoteMinor: 10_000n, // 100.00 USD
        quoteMinorUnits: 2,
        baseMinorUnits: 2,
        rateScaled: 33_123_400n,
      }),
    ).toBe(331_234n); // 3,312.34 THB
  });

  it('converts JPY (0 minor units) to satang, rounding half-up', () => {
    // 1 JPY at 0.2250 THB = 22.5 satang -> 23
    expect(
      convertToBase({
        amountQuoteMinor: 1n,
        quoteMinorUnits: 0,
        baseMinorUnits: 2,
        rateScaled: 225_000n,
      }),
    ).toBe(23n);
  });

  it('inverse conversion round-trips within a minor unit', () => {
    const cents = convertFromBase({
      amountBaseMinor: 331_234n,
      baseMinorUnits: 2,
      quoteMinorUnits: 2,
      rateScaled: 33_123_400n,
    });
    expect(cents).toBe(10_000n);
  });
});

describe('FxRate', () => {
  const props = {
    id: 'r',
    tenantId: 't',
    baseCurrency: 'thb',
    quoteCurrency: 'usd',
    rateDate: '2026-09-01',
    rateScaled: 33_123_400n,
    source: 'MANUAL' as const,
    fetchedAt: new Date('2026-09-01T11:30:00.000Z'),
  };
  it('uppercases codes and rejects same-currency or non-positive rates', () => {
    expect(FxRate.create(props).snapshot()).toMatchObject({
      baseCurrency: 'THB',
      quoteCurrency: 'USD',
    });
    expect(() => FxRate.create({ ...props, quoteCurrency: 'THB' })).toThrow(
      InvalidFxRateError,
    );
    expect(() => FxRate.create({ ...props, rateScaled: 0n })).toThrow(
      InvalidFxRateError,
    );
    expect(() => FxRate.create({ ...props, rateDate: '2026-13-01' })).toThrow();
  });
});
