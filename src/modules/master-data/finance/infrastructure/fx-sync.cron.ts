import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import type { FinanceConfig } from '../../../../shared/config';
import { SyncFxRatesUseCase } from '../application/sync-fx-rates.use-case';

/**
 * BOT publishes the day's weighted-average rate around 18:00 Bangkok.
 * Runs at 18:30 local; disabled entirely (no-op, one info line at
 * first tick) when BOT_API_CLIENT_ID is empty.
 */
@Injectable()
export class FxSyncCron {
  private readonly logger = new Logger(FxSyncCron.name);
  private readonly enabled: boolean;
  private warnedDisabled = false;

  constructor(
    private readonly sync: SyncFxRatesUseCase,
    config: ConfigService,
  ) {
    this.enabled = config.getOrThrow<FinanceConfig>('finance').fxSyncEnabled;
  }

  @Cron('30 18 * * *', { timeZone: 'Asia/Bangkok' })
  async tick(): Promise<void> {
    if (!this.enabled) {
      if (!this.warnedDisabled) {
        this.logger.log('FX sync disabled (BOT_API_CLIENT_ID not set)');
        this.warnedDisabled = true;
      }
      return;
    }
    try {
      const result = await this.sync.execute();
      this.logger.log(
        {
          rateDate: result.rateDate,
          published: result.published,
          tenants: result.tenantsProcessed,
          upserted: result.upserted,
          skippedManual: result.skippedManual,
          missingQuotes: result.missingQuotes,
        },
        'FX sync finished',
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error({ err: reason }, 'FX sync failed');
    }
  }
}
