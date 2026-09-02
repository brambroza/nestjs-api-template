import { DomainError } from '../errors';

export class MoneyError extends DomainError {
  readonly code = 'DOMAIN.MONEY_MISMATCH';
}

export const BASIS_POINTS = 10_000n;
const CURRENCY_RE = /^[A-Z]{3}$/;

/**
 * Integer minor units (satang, cent) + ISO 4217 code. Exact add/sub/mul;
 * the only rounding lives in `percent()` and `divide()`, both half-up,
 * so every document line and total is reproducible to the satang.
 *
 * This is the shared VO for Phase B documents. production-order keeps
 * its own narrower Money (three hard-coded currencies) for now.
 */
export class Money {
  private constructor(
    readonly amount: bigint,
    readonly currency: string,
  ) {}

  static of(amount: bigint, currency: string): Money {
    const code = currency.trim().toUpperCase();
    if (!CURRENCY_RE.test(code)) {
      throw new MoneyError(`"${currency}" is not an ISO 4217 code`);
    }
    return new Money(amount, code);
  }

  static zero(currency: string): Money {
    return Money.of(0n, currency);
  }

  private same(other: Money): void {
    if (this.currency !== other.currency) {
      throw new MoneyError(
        `Cannot combine ${this.currency} with ${other.currency}`,
      );
    }
  }

  add(other: Money): Money {
    this.same(other);
    return new Money(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    this.same(other);
    return new Money(this.amount - other.amount, this.currency);
  }

  multiply(factor: bigint): Money {
    return new Money(this.amount * factor, this.currency);
  }

  /** amount × bp / 10000, rounded half away from zero. */
  percent(basisPoints: bigint): Money {
    return new Money(
      roundDiv(this.amount * basisPoints, BASIS_POINTS),
      this.currency,
    );
  }

  divide(divisor: bigint): Money {
    return new Money(roundDiv(this.amount, divisor), this.currency);
  }

  negate(): Money {
    return new Money(-this.amount, this.currency);
  }

  isZero(): boolean {
    return this.amount === 0n;
  }
  isNegative(): boolean {
    return this.amount < 0n;
  }
  isGreaterThan(other: Money): boolean {
    this.same(other);
    return this.amount > other.amount;
  }
  isGreaterThanOrEqual(other: Money): boolean {
    this.same(other);
    return this.amount >= other.amount;
  }
  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount === other.amount;
  }

  toJSON(): { amount: string; currency: string } {
    return { amount: this.amount.toString(), currency: this.currency };
  }
}

/** Integer division rounded half away from zero. */
export function roundDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new MoneyError('division by zero');
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (n + d / 2n) / d;
  return negative ? -q : q;
}

export function sumMoney(items: readonly Money[], currency: string): Money {
  return items.reduce((acc, m) => acc.add(m), Money.zero(currency));
}
