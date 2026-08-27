import { DomainError } from '../../../../shared/errors';

/**
 * Money stored as an integer number of the currency's minor unit
 * (satang for THB, cent for USD). Arithmetic is exact; there is no
 * `divide` because division introduces rounding — the caller must
 * decide the rounding policy explicitly.
 */
export class MoneyMismatchError extends DomainError {
  readonly code = 'DOMAIN.MONEY_MISMATCH';
}

export type CurrencyCode = 'THB' | 'USD' | 'JPY';

export class Money {
  private constructor(
    readonly amount: bigint,
    readonly currency: CurrencyCode,
  ) {}

  static of(amount: bigint, currency: CurrencyCode): Money {
    return new Money(amount, currency);
  }

  static thb(satang: bigint): Money {
    return new Money(satang, 'THB');
  }

  static zero(currency: CurrencyCode): Money {
    return new Money(0n, currency);
  }

  private sameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new MoneyMismatchError(
        `Cannot combine ${this.currency} with ${other.currency}`,
      );
    }
  }

  add(other: Money): Money {
    this.sameCurrency(other);
    return new Money(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    this.sameCurrency(other);
    return new Money(this.amount - other.amount, this.currency);
  }

  isGreaterThan(other: Money): boolean {
    this.sameCurrency(other);
    return this.amount > other.amount;
  }

  isGreaterThanOrEqual(other: Money): boolean {
    this.sameCurrency(other);
    return this.amount >= other.amount;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount === other.amount;
  }

  toJSON(): { amount: string; currency: CurrencyCode } {
    return { amount: this.amount.toString(), currency: this.currency };
  }
}
