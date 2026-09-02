import { FxSourceUnavailableError } from '../domain';

import { parseBotDailyPayload } from './bot-fx-rate.client';

describe('parseBotDailyPayload', () => {
  const payload = {
    result: {
      timestamp: '2026-09-01 18:05:00',
      data: {
        data_header: {
          report_name_eng:
            'Rates of Exchange of Commercial Banks in Bangkok Metropolis',
        },
        data_detail: [
          {
            period: '2026-09-01',
            currency_id: 'USD',
            currency_name_eng: 'USA : DOLLAR (USD)',
            buying_sight: '33.0100',
            buying_transfer: '33.0500',
            selling: '33.3000',
            mid_rate: '33.1234',
          },
          {
            period: '2026-09-01',
            currency_id: 'JPY',
            currency_name_eng: 'JAPAN : YEN (100) (JPY)',
            mid_rate: '22.5000',
          },
          {
            period: '2026-09-01',
            currency_id: 'EUR',
            currency_name_eng: 'EURO ZONE : EURO (EUR)',
            mid_rate: '',
          },
          {
            period: '2026-08-31',
            currency_id: 'GBP',
            currency_name_eng: 'UK : POUND',
            mid_rate: '42.0000',
          },
          { period: '2026-09-01', currency_id: 'XX', mid_rate: '1' },
        ],
      },
    },
  };

  it('normalises per-100 quotes, skips blanks, wrong dates and bad codes', () => {
    expect(parseBotDailyPayload(payload, '2026-09-01')).toEqual([
      { quoteCurrency: 'USD', rateDate: '2026-09-01', rateScaled: 33_123_400n },
      { quoteCurrency: 'JPY', rateDate: '2026-09-01', rateScaled: 225_000n }, // 22.5 / 100
    ]);
  });

  it('empty detail (holiday) is an empty list, not an error', () => {
    expect(
      parseBotDailyPayload(
        { result: { data: { data_detail: [] } } },
        '2026-09-01',
      ),
    ).toEqual([]);
    expect(
      parseBotDailyPayload({ result: { data: {} } }, '2026-09-01'),
    ).toEqual([]);
  });

  it('a malformed envelope is a source error', () => {
    expect(() => parseBotDailyPayload('nope', '2026-09-01')).toThrow(
      FxSourceUnavailableError,
    );
    expect(() =>
      parseBotDailyPayload(
        { result: { data: { data_detail: 'x' } } },
        '2026-09-01',
      ),
    ).toThrow(FxSourceUnavailableError);
  });
});
