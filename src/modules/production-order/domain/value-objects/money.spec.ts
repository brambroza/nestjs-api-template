import { Money, MoneyMismatchError } from './money';

describe('Money', () => {
  it('exposes bigint amount and currency; JSON round-trip stringifies the bigint', () => {
    const m = Money.thb(1_234_56n);
    expect(m.amount).toBe(1_234_56n);
    expect(m.currency).toBe('THB');
    expect(m.toJSON()).toEqual({ amount: '123456', currency: 'THB' });
  });

  it('adds and subtracts within the same currency', () => {
    const a = Money.thb(1000n);
    const b = Money.thb(250n);
    expect(a.add(b).amount).toBe(1250n);
    expect(a.subtract(b).amount).toBe(750n);
  });

  it('throws MoneyMismatchError when combining different currencies', () => {
    const thb = Money.thb(100n);
    const usd = Money.of(100n, 'USD');
    expect(() => thb.add(usd)).toThrow(MoneyMismatchError);
    expect(() => thb.subtract(usd)).toThrow(MoneyMismatchError);
    expect(() => thb.isGreaterThan(usd)).toThrow(MoneyMismatchError);
    expect(() => thb.isGreaterThanOrEqual(usd)).toThrow(MoneyMismatchError);
  });

  it('comparisons treat >= as inclusive and > as strict', () => {
    const a = Money.thb(100n);
    const same = Money.thb(100n);
    const bigger = Money.thb(101n);
    expect(bigger.isGreaterThan(a)).toBe(true);
    expect(a.isGreaterThan(same)).toBe(false);
    expect(a.isGreaterThanOrEqual(same)).toBe(true);
    expect(bigger.isGreaterThanOrEqual(a)).toBe(true);
  });

  it('equals is false when currencies differ even when amounts match', () => {
    const thb = Money.thb(0n);
    const zero = Money.zero('THB');
    const usd = Money.zero('USD');
    expect(thb.equals(zero)).toBe(true);
    expect(thb.equals(usd)).toBe(false);
  });
});
