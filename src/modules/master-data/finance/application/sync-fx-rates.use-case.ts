import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { FxRate, FxRateSource, toIsoDate, type IsoDate } from '../domain';

import {
  CURRENCY_REPOSITORY,
  type CurrencyRepository,
} from './ports/currency.repository';
import {
  FX_RATE_SOURCE,
  type FxRateSource as FxRateSourcePort,
} from './ports/fx-rate-source.port';
import {
  FX_RATE_REPOSITORY,
  type FxRateRepository,
} from './ports/fx-rate.repository';
import {
  TENANT_DIRECTORY,
  type TenantDirectory,
} from './ports/tenant-directory.port';

export interface SyncFxRatesInput {
  /** Defaults to today (UTC date). */
  readonly rateDate?: IsoDate | null;
  /** Restrict to these tenants (the admin endpoint passes its own); omit = all. */
  readonly tenantIds?: readonly string[] | null;
}

export interface SyncFxRatesResult {
  readonly rateDate: IsoDate;
  readonly published: boolean;
  readonly tenantsProcessed: number;
  readonly upserted: number;
  readonly skippedManual: number;
  /** Active tenant currencies the source had no rate for (per tenant, deduplicated). */
  readonly missingQuotes: readonly string[];
}

/**
 * Pulls the day's fixing once and fans it out to every tenant's active
 * non-THB currencies. A MANUAL rate for the same day is never
 * overwritten — an accountant's override outranks the feed. No tenant
 * context: the cron calls this with none, so tenant ids are explicit.
 */
@Injectable()
export class SyncFxRatesUseCase {
  private static readonly BASE = 'THB';

  constructor(
    @Inject(FX_RATE_SOURCE) private readonly source: FxRateSourcePort,
    @Inject(FX_RATE_REPOSITORY) private readonly rates: FxRateRepository,
    @Inject(CURRENCY_REPOSITORY)
    private readonly currencies: CurrencyRepository,
    @Inject(TENANT_DIRECTORY) private readonly tenants: TenantDirectory,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: SyncFxRatesInput = {}): Promise<SyncFxRatesResult> {
    const now = this.clock.now();
    const rateDate = input.rateDate ?? toIsoDate(now);
    const fetched = await this.source.fetchDaily(rateDate);
    const byQuote = new Map(
      fetched.map((f) => [f.quoteCurrency.toUpperCase(), f]),
    );
    const tenantIds = input.tenantIds ?? (await this.tenants.listTenantIds());

    let upserted = 0;
    let skippedManual = 0;
    const missing = new Set<string>();

    for (const tenantId of tenantIds) {
      const active = await this.currencies.list(tenantId, { activeOnly: true });
      for (const c of active) {
        const code = c.snapshot().code;
        if (code === SyncFxRatesUseCase.BASE) continue;
        const f = byQuote.get(code);
        if (!f) {
          if (fetched.length > 0) missing.add(code);
          continue;
        }
        const existing = await this.rates.findExact(
          tenantId,
          SyncFxRatesUseCase.BASE,
          code,
          rateDate,
        );
        if (existing?.snapshot().source === FxRateSource.Manual) {
          skippedManual += 1;
          continue;
        }
        await this.rates.upsert(
          FxRate.create({
            id: existing?.snapshot().id ?? randomUUID(),
            tenantId,
            baseCurrency: SyncFxRatesUseCase.BASE,
            quoteCurrency: code,
            rateDate,
            rateScaled: f.rateScaled,
            source: FxRateSource.Bot,
            fetchedAt: now,
          }),
        );
        upserted += 1;
      }
    }

    return {
      rateDate,
      published: fetched.length > 0,
      tenantsProcessed: tenantIds.length,
      upserted,
      skippedManual,
      missingQuotes: [...missing].sort(),
    };
  }
}
