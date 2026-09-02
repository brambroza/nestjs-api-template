import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { toIsoDate } from '../../../../shared/domain';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../../../shared/transaction';
import { QuotationVersionConflictError } from '../domain';

import { QUOTATION_OUTBOX, type QuotationOutbox } from './ports/outbox.port';
import {
  QUOTATION_REPOSITORY,
  type QuotationRepository,
} from './ports/quotation.repository';
import { resolvedEvent } from './quotation.use-cases';

export interface ExpireQuotationsResult {
  readonly checked: number;
  readonly expired: number;
  readonly skipped: number;
}

export const SYSTEM_ACTOR = 'system';

/**
 * T-204. Runs from the nightly cron across ALL tenants (no request, no
 * tenant context): every SENT quotation whose validUntil is before
 * today flips to EXPIRED, one transaction per row so a single
 * concurrent edit (version conflict) skips that row and never blocks
 * the rest.
 */
@Injectable()
export class ExpireQuotationsUseCase {
  private static readonly BATCH = 200;

  constructor(
    @Inject(QUOTATION_REPOSITORY) private readonly repo: QuotationRepository,
    @Inject(QUOTATION_OUTBOX) private readonly outbox: QuotationOutbox,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<ExpireQuotationsResult> {
    const now = this.clock.now();
    const todayIso = toIsoDate(now);
    const due = await this.repo.listDueForExpiry(
      todayIso,
      ExpireQuotationsUseCase.BATCH,
    );
    let expired = 0;
    let skipped = 0;
    for (const q of due) {
      if (!q.isDueForExpiry(todayIso)) {
        skipped += 1;
        continue;
      }
      try {
        await this.tx.runInTransaction(async () => {
          const saved = await this.repo.save(q.expire(now));
          await this.outbox.enqueue({
            idempotencyKey: `${saved.id}:expired:${String(saved.snapshot().revision)}`,
            event: resolvedEvent(
              saved,
              'quotation.expired.v1',
              SYSTEM_ACTOR,
              now,
            ),
          });
        });
        expired += 1;
      } catch (err) {
        if (err instanceof QuotationVersionConflictError) {
          skipped += 1;
          continue;
        }
        throw err;
      }
    }
    return { checked: due.length, expired, skipped };
  }
}
