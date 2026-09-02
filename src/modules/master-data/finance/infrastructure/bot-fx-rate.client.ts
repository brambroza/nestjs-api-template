import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { request } from 'undici';

import type { FinanceConfig } from '../../../../shared/config';
import {
  CURRENCY_CODE_RE,
  FxSourceUnavailableError,
  parseDecimalToScaled,
  type IsoDate,
} from '../domain';
import type {
  FetchedFxRate,
  FxRateSource,
} from '../application/ports/fx-rate-source.port';

/**
 * Bank of Thailand "Daily Weighted-average Interbank Exchange Rate"
 * (Stat-ExchangeRate v2, DAILY_AVG_EXG_RATE). BOT quotes some
 * currencies per 100 units — the English name carries "(100)" — so
 * the parser normalises everything to a single unit before it reaches
 * the domain. Pure `parseBotDailyPayload` is unit-tested; the class is
 * the HTTP shell around it.
 */
export function parseBotDailyPayload(
  payload: unknown,
  rateDate: IsoDate,
): readonly FetchedFxRate[] {
  const detail = extractDetail(payload);
  const out: FetchedFxRate[] = [];
  for (const row of detail) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as Record<string, unknown>;
    const code =
      typeof r['currency_id'] === 'string'
        ? r['currency_id'].trim().toUpperCase()
        : '';
    const mid = typeof r['mid_rate'] === 'string' ? r['mid_rate'].trim() : '';
    const period =
      typeof r['period'] === 'string' ? r['period'].trim() : rateDate;
    if (!CURRENCY_CODE_RE.test(code) || mid.length === 0 || period !== rateDate)
      continue;
    const nameEng =
      typeof r['currency_name_eng'] === 'string' ? r['currency_name_eng'] : '';
    const perUnits = /\((\d+)\)/.exec(nameEng);
    const divisor = perUnits ? BigInt(perUnits[1] ?? '1') : 1n;
    let scaled: bigint;
    try {
      scaled = parseDecimalToScaled(mid);
    } catch {
      continue;
    }
    if (divisor > 1n) scaled = scaled / divisor;
    if (scaled <= 0n) continue;
    out.push({ quoteCurrency: code, rateDate, rateScaled: scaled });
  }
  return out;
}

function extractDetail(payload: unknown): readonly unknown[] {
  if (typeof payload !== 'object' || payload === null) {
    throw new FxSourceUnavailableError('BOT payload is not an object');
  }
  const result = (payload as Record<string, unknown>)['result'];
  const data =
    typeof result === 'object' && result !== null
      ? (result as Record<string, unknown>)['data']
      : undefined;
  const detail =
    typeof data === 'object' && data !== null
      ? (data as Record<string, unknown>)['data_detail']
      : undefined;
  if (detail === undefined || detail === null) return [];
  if (!Array.isArray(detail)) {
    throw new FxSourceUnavailableError(
      'BOT payload result.data.data_detail is not an array',
    );
  }
  return detail;
}

@Injectable()
export class BotFxRateClient implements FxRateSource {
  private readonly logger = new Logger(BotFxRateClient.name);
  private readonly baseUrl: string;
  private readonly clientId: string;

  constructor(config: ConfigService) {
    const finance = config.getOrThrow<FinanceConfig>('finance');
    this.baseUrl = finance.botApiBaseUrl.replace(/\/+$/, '');
    this.clientId = finance.botApiClientId;
  }

  async fetchDaily(rateDate: IsoDate): Promise<readonly FetchedFxRate[]> {
    if (this.clientId.length === 0) {
      throw new FxSourceUnavailableError('BOT_API_CLIENT_ID is not configured');
    }
    const url = `${this.baseUrl}/Stat-ExchangeRate/v2/DAILY_AVG_EXG_RATE/?start_period=${rateDate}&end_period=${rateDate}`;
    let statusCode: number;
    let text: string;
    try {
      const res = await request(url, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'x-ibm-client-id': this.clientId,
        },
        headersTimeout: 15_000,
        bodyTimeout: 15_000,
      });
      statusCode = res.statusCode;
      text = await res.body.text();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn({ reason }, 'BOT FX request failed');
      throw new FxSourceUnavailableError(`BOT request failed: ${reason}`);
    }
    if (statusCode < 200 || statusCode >= 300) {
      throw new FxSourceUnavailableError(
        `BOT HTTP ${String(statusCode)}: ${text.slice(0, 200)}`,
      );
    }
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new FxSourceUnavailableError('BOT response is not JSON');
    }
    return parseBotDailyPayload(payload, rateDate);
  }
}
