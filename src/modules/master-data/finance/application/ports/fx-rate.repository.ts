import type { FxRate, IsoDate } from '../../domain';

export const FX_RATE_REPOSITORY = Symbol('FX_RATE_REPOSITORY');

export interface FxRateRepository {
  findExact(
    tenantId: string,
    baseCurrency: string,
    quoteCurrency: string,
    rateDate: IsoDate,
  ): Promise<FxRate | null>;
  /** Most recent rate dated on or before `rateDate` — weekends/holidays fall back to the last fixing. */
  findLatestOnOrBefore(
    tenantId: string,
    baseCurrency: string,
    quoteCurrency: string,
    rateDate: IsoDate,
  ): Promise<FxRate | null>;
  list(
    tenantId: string,
    opts: {
      readonly baseCurrency: string;
      readonly quoteCurrency?: string | null;
      readonly from: IsoDate;
      readonly to: IsoDate;
    },
  ): Promise<readonly FxRate[]>;
  /** Insert or replace by (tenant, base, quote, date). */
  upsert(rate: FxRate): Promise<void>;
}
