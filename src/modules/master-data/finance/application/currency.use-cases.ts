import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  Currency,
  CurrencyNotFoundError,
  DuplicateCurrencyCodeError,
  FxRate,
  FxRateNotFoundError,
  FxRateSource,
  convertFromBase,
  convertToBase,
  toIsoDate,
  type IsoDate,
} from '../domain';

import {
  CURRENCY_REPOSITORY,
  type CurrencyRepository,
} from './ports/currency.repository';
import {
  FX_RATE_REPOSITORY,
  type FxRateRepository,
} from './ports/fx-rate.repository';

/** BOT quotes everything against THB; manual rates may use another base. */
export const DEFAULT_BASE_CURRENCY = 'THB';

@Injectable()
export class ListCurrenciesUseCase {
  constructor(
    @Inject(CURRENCY_REPOSITORY) private readonly repo: CurrencyRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(
    input: { readonly activeOnly?: boolean } = {},
  ): Promise<readonly Currency[]> {
    return this.repo.list(this.tenant.getTenantId(), {
      activeOnly: input.activeOnly ?? true,
    });
  }
}

export interface CreateCurrencyInput {
  readonly code: string;
  readonly name: string;
  readonly minorUnits?: number;
}

@Injectable()
export class CreateCurrencyUseCase {
  constructor(
    @Inject(CURRENCY_REPOSITORY) private readonly repo: CurrencyRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateCurrencyInput): Promise<Currency> {
    const tenantId = this.tenant.getTenantId();
    const code = input.code.trim().toUpperCase();
    if (await this.repo.findByCode(tenantId, code)) {
      throw new DuplicateCurrencyCodeError(code);
    }
    const currency = Currency.create({
      id: randomUUID(),
      tenantId,
      code,
      name: input.name,
      minorUnits: input.minorUnits,
      now: this.clock.now(),
    });
    await this.repo.create(currency);
    return currency;
  }
}

export interface GetFxRateInput {
  readonly baseCurrency?: string | null;
  readonly quoteCurrency: string;
  /** Defaults to today. */
  readonly rateDate?: IsoDate | null;
}

@Injectable()
export class GetFxRateUseCase {
  constructor(
    @Inject(FX_RATE_REPOSITORY) private readonly rates: FxRateRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: GetFxRateInput): Promise<FxRate> {
    const base = (input.baseCurrency ?? DEFAULT_BASE_CURRENCY).toUpperCase();
    const quote = input.quoteCurrency.toUpperCase();
    const date = input.rateDate ?? toIsoDate(this.clock.now());
    const rate = await this.rates.findLatestOnOrBefore(
      this.tenant.getTenantId(),
      base,
      quote,
      date,
    );
    if (!rate) throw new FxRateNotFoundError(base, quote, date);
    return rate;
  }
}

export interface UpsertFxRateInput {
  readonly baseCurrency?: string | null;
  readonly quoteCurrency: string;
  readonly rateDate: IsoDate;
  readonly rateScaled: bigint;
}

/** Manual entry. Overrides a BOT rate for the same day and is never overwritten by the sync. */
@Injectable()
export class UpsertFxRateUseCase {
  constructor(
    @Inject(FX_RATE_REPOSITORY) private readonly rates: FxRateRepository,
    @Inject(CURRENCY_REPOSITORY)
    private readonly currencies: CurrencyRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: UpsertFxRateInput): Promise<FxRate> {
    const tenantId = this.tenant.getTenantId();
    const base = (input.baseCurrency ?? DEFAULT_BASE_CURRENCY).toUpperCase();
    const quote = input.quoteCurrency.toUpperCase();
    const [b, q] = await Promise.all([
      this.currencies.findByCode(tenantId, base),
      this.currencies.findByCode(tenantId, quote),
    ]);
    if (!b) throw new CurrencyNotFoundError(base);
    if (!q) throw new CurrencyNotFoundError(quote);
    const rate = FxRate.create({
      id: randomUUID(),
      tenantId,
      baseCurrency: base,
      quoteCurrency: quote,
      rateDate: input.rateDate,
      rateScaled: input.rateScaled,
      source: FxRateSource.Manual,
      fetchedAt: this.clock.now(),
      createdBy: this.tenant.getUserId(),
    });
    await this.rates.upsert(rate);
    return rate;
  }
}

export interface ListFxRatesInput {
  readonly baseCurrency?: string | null;
  readonly quoteCurrency?: string | null;
  readonly from: IsoDate;
  readonly to: IsoDate;
}

@Injectable()
export class ListFxRatesUseCase {
  constructor(
    @Inject(FX_RATE_REPOSITORY) private readonly rates: FxRateRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
  ) {}

  async execute(input: ListFxRatesInput): Promise<readonly FxRate[]> {
    return this.rates.list(this.tenant.getTenantId(), {
      baseCurrency: (input.baseCurrency ?? DEFAULT_BASE_CURRENCY).toUpperCase(),
      quoteCurrency: input.quoteCurrency?.toUpperCase() ?? null,
      from: input.from,
      to: input.to,
    });
  }
}

export interface ConvertAmountInput {
  readonly amountMinor: bigint;
  readonly fromCurrency: string;
  readonly toCurrency: string;
  readonly rateDate?: IsoDate | null;
}

export interface ConvertedAmount {
  readonly amountMinor: bigint;
  readonly fromCurrency: string;
  readonly toCurrency: string;
  readonly resultMinor: bigint;
  readonly rateDate: IsoDate;
  readonly ratesUsed: readonly FxRate[];
}

/**
 * Converts through THB: foreign -> THB -> foreign when neither side is
 * the base. Every step is bigint; rounding happens once per hop at the
 * target's minor unit.
 */
@Injectable()
export class ConvertAmountUseCase {
  constructor(
    @Inject(FX_RATE_REPOSITORY) private readonly rates: FxRateRepository,
    @Inject(CURRENCY_REPOSITORY)
    private readonly currencies: CurrencyRepository,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: ConvertAmountInput): Promise<ConvertedAmount> {
    const tenantId = this.tenant.getTenantId();
    const from = input.fromCurrency.toUpperCase();
    const to = input.toCurrency.toUpperCase();
    const rateDate = input.rateDate ?? toIsoDate(this.clock.now());

    const [fromCur, toCur] = await Promise.all([
      this.currencies.findByCode(tenantId, from),
      this.currencies.findByCode(tenantId, to),
    ]);
    if (!fromCur) throw new CurrencyNotFoundError(from);
    if (!toCur) throw new CurrencyNotFoundError(to);
    const base = DEFAULT_BASE_CURRENCY;
    const baseMU =
      fromCur.snapshot().code === base ? fromCur.snapshot().minorUnits : 2;

    const done = (
      resultMinor: bigint,
      ratesUsed: readonly FxRate[],
    ): ConvertedAmount => ({
      amountMinor: input.amountMinor,
      fromCurrency: from,
      toCurrency: to,
      resultMinor,
      rateDate,
      ratesUsed,
    });

    if (from === to) return done(input.amountMinor, []);

    const rateFor = async (quote: string): Promise<FxRate> => {
      const r = await this.rates.findLatestOnOrBefore(
        tenantId,
        base,
        quote,
        rateDate,
      );
      if (!r) throw new FxRateNotFoundError(base, quote, rateDate);
      return r;
    };

    if (to === base) {
      const r = await rateFor(from);
      return done(
        convertToBase({
          amountQuoteMinor: input.amountMinor,
          quoteMinorUnits: fromCur.snapshot().minorUnits,
          baseMinorUnits: toCur.snapshot().minorUnits,
          rateScaled: r.snapshot().rateScaled,
        }),
        [r],
      );
    }
    if (from === base) {
      const r = await rateFor(to);
      return done(
        convertFromBase({
          amountBaseMinor: input.amountMinor,
          baseMinorUnits: fromCur.snapshot().minorUnits,
          quoteMinorUnits: toCur.snapshot().minorUnits,
          rateScaled: r.snapshot().rateScaled,
        }),
        [r],
      );
    }
    const [rFrom, rTo] = await Promise.all([rateFor(from), rateFor(to)]);
    const inBase = convertToBase({
      amountQuoteMinor: input.amountMinor,
      quoteMinorUnits: fromCur.snapshot().minorUnits,
      baseMinorUnits: baseMU,
      rateScaled: rFrom.snapshot().rateScaled,
    });
    return done(
      convertFromBase({
        amountBaseMinor: inBase,
        baseMinorUnits: baseMU,
        quoteMinorUnits: toCur.snapshot().minorUnits,
        rateScaled: rTo.snapshot().rateScaled,
      }),
      [rFrom, rTo],
    );
  }
}
