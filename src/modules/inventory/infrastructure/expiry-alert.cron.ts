import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { ExpiryAlertUseCase } from '../application/expiry-alert.use-case';

/** T-322: 00:15 Bangkok daily, after the quotation expiry sweep. Idempotent. */
@Injectable()
export class ExpiryAlertCron {
  private readonly logger = new Logger(ExpiryAlertCron.name);

  constructor(private readonly alerts: ExpiryAlertUseCase) {}

  @Cron('15 0 * * *', { timeZone: 'Asia/Bangkok' })
  async tick(): Promise<void> {
    try {
      const result = await this.alerts.execute();
      if (result.checked > 0)
        this.logger.log(result, 'lot expiry sweep finished');
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error({ err: reason }, 'lot expiry sweep failed');
    }
  }
}
