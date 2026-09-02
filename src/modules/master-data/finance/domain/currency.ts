import { DomainError } from '../../../../shared/errors';

import { assertIsoDate, type IsoDate } from './iso-date';

export class CurrencyNotFoundError extends DomainError {
  readonly code = 'FINANCE.CURRENCY_NOT_FOUND';
  constructor(readonly currencyCode: string) {
    super(`Currency ${currencyCode} is not configured for this tenant`);
  }
}

export class DuplicateCurrencyCodeError extends DomainError {
  readonly code = 'FINANCE.DUPLICATE_CURRENCY_CODE';
  constructor(readonly currencyCode: string) {
    super(`Currency ${currencyCode} already exists in this tenant`);
  }
}

export class InvalidCurrencyFieldError extends DomainError {
  readonly code = 'FINANCE.INVALID_CURRENCY_FIELD';
}

export class FxRateNotFoundError extends DomainError {
  readonly code = 'FINANCE.FX_RATE_NOT_FOUND';
  constructor(
    readonly baseCurrency: string,
    readonly quoteCurrency: string,
    readonly rateDate: IsoDate,
  ) {
    super(`No ${quoteCurrency}/${baseCurrency} rate on or before ${rateDate}`);
  }
}

export class InvalidFxRateError extends DomainError {
  readonly code = 'FINANCE.INVALID_FX_RATE';
}

/** The FX source (BOT) could not be reached or returned an unusable payload. */
export class FxSourceUnavailableError extends DomainError {
  readonly code = 'FINANCE.FX_SOURCE_UNAVAILABLE';
}

export const CURRENCY_CODE_RE = /^[A-Z]{3}$/;

export interface CurrencySnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly minorUnits: number;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Currency {
  private constructor(private readonly s: CurrencySnapshot) {}

  static create(props: {
    readonly id: string;
    readonly tenantId: string;
    readonly code: string;
    readonly name: string;
    readonly minorUnits?: number;
    readonly now: Date;
  }): Currency {
    const code = props.code.trim().toUpperCase();
    if (!CURRENCY_CODE_RE.test(code)) {
      throw new InvalidCurrencyFieldError(
        'code must be a 3-letter ISO 4217 code',
      );
    }
    const name = props.name.trim();
    if (name.length === 0 || name.length > 64) {
      throw new InvalidCurrencyFieldError('name must be 1-64 characters');
    }
    const minorUnits = props.minorUnits ?? 2;
    if (!Number.isInteger(minorUnits) || minorUnits < 0 || minorUnits > 4) {
      throw new InvalidCurrencyFieldError('minorUnits must be an integer 0-4');
    }
    return new Currency({
      id: props.id,
      tenantId: props.tenantId,
      code,
      name,
      minorUnits,
      isActive: true,
      createdAt: props.now,
      updatedAt: props.now,
    });
  }

  static fromSnapshot(s: CurrencySnapshot): Currency {
    return new Currency(s);
  }

  snapshot(): CurrencySnapshot {
    return this.s;
  }
}

// ---- FX --------------------------------------------------------------------

/** Rates carry 6 decimals: rateScaled = rate × 1e6. */
export const RATE_SCALE = 1_000_000n;
export const RATE_DECIMALS = 6;

export const FxRateSource = { Bot: 'BOT', Manual: 'MANUAL' } as const;
export type FxRateSource = (typeof FxRateSource)[keyof typeof FxRateSource];

export interface FxRateSnapshot {
  readonly id: string;
  readonly tenantId: string;
  /** Currency the rate is expressed in (THB for BOT). */
  readonly baseCurrency: string;
  /** Currency being priced: 1 quote = rateScaled/1e6 base. */
  readonly quoteCurrency: string;
  readonly rateDate: IsoDate;
  readonly rateScaled: bigint;
  readonly source: FxRateSource;
  readonly fetchedAt: Date;
  readonly createdBy: string | null;
}

export class FxRate {
  private constructor(private readonly s: FxRateSnapshot) {}

  static create(props: {
    readonly id: string;
    readonly tenantId: string;
    readonly baseCurrency: string;
    readonly quoteCurrency: string;
    readonly rateDate: IsoDate;
    readonly rateScaled: bigint;
    readonly source: FxRateSource;
    readonly fetchedAt: Date;
    readonly createdBy?: string | null;
  }): FxRate {
    const base = props.baseCurrency.trim().toUpperCase();
    const quote = props.quoteCurrency.trim().toUpperCase();
    if (!CURRENCY_CODE_RE.test(base) || !CURRENCY_CODE_RE.test(quote)) {
      throw new InvalidFxRateError('currency codes must be 3-letter ISO 4217');
    }
    if (base === quote) {
      throw new InvalidFxRateError('base and quote currency must differ');
    }
    if (props.rateScaled <= 0n) {
      throw new InvalidFxRateError('rate must be positive');
    }
    return new FxRate({
      id: props.id,
      tenantId: props.tenantId,
      baseCurrency: base,
      quoteCurrency: quote,
      rateDate: assertIsoDate(props.rateDate, 'rateDate'),
      rateScaled: props.rateScaled,
      source: props.source,
      fetchedAt: props.fetchedAt,
      createdBy: props.createdBy ?? null,
    });
  }

  static fromSnapshot(s: FxRateSnapshot): FxRate {
    return new FxRate(s);
  }

  snapshot(): FxRateSnapshot {
    return this.s;
  }
}

/**
 * "33.1234" -> 33123400n (6 dp). Pure string arithmetic; a float never
 * touches the value. More than 6 decimals is rounded half-up.
 */
export function parseDecimalToScaled(text: string): bigint {
  const t = text.trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(t);
  if (!m) throw new InvalidFxRateError(`"${text}" is not a decimal number`);
  const whole = m[1] ?? '0';
  const frac = m[2] ?? '';
  const kept = frac.slice(0, RATE_DECIMALS).padEnd(RATE_DECIMALS, '0');
  let scaled = BigInt(whole) * RATE_SCALE + BigInt(kept);
  const next = frac.charAt(RATE_DECIMALS);
  if (next !== '' && Number(next) >= 5) scaled += 1n;
  return scaled;
}

/** 33123400n -> "33.123400" */
export function formatScaled(scaled: bigint): string {
  const sign = scaled < 0n ? '-' : '';
  const abs = scaled < 0n ? -scaled : scaled;
  const whole = abs / RATE_SCALE;
  const frac = (abs % RATE_SCALE).toString().padStart(RATE_DECIMALS, '0');
  return `${sign}${whole.toString()}.${frac}`;
}

/** Integer division rounded half away from zero. */
export function roundDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new InvalidFxRateError('division by zero');
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (n + d / 2n) / d;
  return negative ? -q : q;
}

const pow10 = (n: number): bigint => 10n ** BigInt(n);

/**
 * Quote-currency minor units -> base-currency minor units.
 *   baseMinor = quoteMinor × rate × 10^baseMU / 10^quoteMU
 * e.g. 10000 US cents at 33.1234 -> 331234 satang.
 */
export function convertToBase(args: {
  readonly amountQuoteMinor: bigint;
  readonly quoteMinorUnits: number;
  readonly baseMinorUnits: number;
  readonly rateScaled: bigint;
}): bigint {
  return roundDiv(
    args.amountQuoteMinor * args.rateScaled * pow10(args.baseMinorUnits),
    RATE_SCALE * pow10(args.quoteMinorUnits),
  );
}

/** Base-currency minor units -> quote-currency minor units (inverse). */
export function convertFromBase(args: {
  readonly amountBaseMinor: bigint;
  readonly baseMinorUnits: number;
  readonly quoteMinorUnits: number;
  readonly rateScaled: bigint;
}): bigint {
  return roundDiv(
    args.amountBaseMinor * RATE_SCALE * pow10(args.quoteMinorUnits),
    args.rateScaled * pow10(args.baseMinorUnits),
  );
}
