import type { IsoDate } from '../../domain';

export const FX_RATE_SOURCE = Symbol('FX_RATE_SOURCE');

export interface FetchedFxRate {
  /** Always THB-based for BOT. */
  readonly quoteCurrency: string;
  readonly rateDate: IsoDate;
  /** 1 quote = rateScaled/1e6 THB, already normalised to a single unit. */
  readonly rateScaled: bigint;
}

/** Bank of Thailand daily reference rates (or any drop-in replacement). */
export interface FxRateSource {
  /** Empty on non-business days — the source publishes nothing. */
  fetchDaily(rateDate: IsoDate): Promise<readonly FetchedFxRate[]>;
}
