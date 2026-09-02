import { Money, MoneyError, roundDiv, sumMoney } from './money';

describe('shared Money', () => {
  it('normalises the currency and rejects a bad code', () => {
    expect(Money.of(1n, 'thb').currency).toBe('THB');
    expect(() => Money.of(1n, 'TH')).toThrow(MoneyError);
  });

  it('refuses to mix currencies', () => {
    expect(() => Money.of(1n, 'THB').add(Money.of(1n, 'USD'))).toThrow(
      MoneyError,
    );
  });

  it('percent rounds half away from zero at the minor unit', () => {
    expect(Money.of(100_000n, 'THB').percent(700n).amount).toBe(7_000n);
    expect(Money.of(123_456n, 'THB').percent(300n).amount).toBe(3_704n);
    expect(Money.of(-123_456n, 'THB').percent(300n).amount).toBe(-3_704n);
    expect(Money.of(5n, 'THB').percent(1_000n).amount).toBe(1n); // 0.5 -> 1
  });

  it('multiply / divide / sum', () => {
    expect(Money.of(150_000n, 'THB').multiply(3n).amount).toBe(450_000n);
    expect(Money.of(10n, 'THB').divide(4n).amount).toBe(3n); // 2.5 -> 3
    expect(
      sumMoney([Money.of(1n, 'THB'), Money.of(2n, 'THB')], 'THB').amount,
    ).toBe(3n);
    expect(roundDiv(-7n, 2n)).toBe(-4n);
  });
});
