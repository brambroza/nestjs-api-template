import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { ExpireQuotationsUseCase } from '../application/expire-quotations.use-case';

/**
 * T-204. 00:05 Bangkok every day: a quotation valid "until 2026-09-30"
 * is still acceptable all of the 30th and expires on the 1st. The
 * use case is idempotent, so a missed or doubled run is harmless.
 */
@Injectable()
export class QuotationExpiryCron {
  private readonly logger = new Logger(QuotationExpiryCron.name);

  constructor(private readonly expire: ExpireQuotationsUseCase) {}

  @Cron('5 0 * * *', { timeZone: 'Asia/Bangkok' })
  async tick(): Promise<void> {
    try {
      const result = await this.expire.execute();
      if (result.checked > 0) {
        this.logger.log(result, 'quotation expiry sweep finished');
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error({ err: reason }, 'quotation expiry sweep failed');
    }
  }
}
