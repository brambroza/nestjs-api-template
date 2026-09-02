import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../shared/clock';
import { addDays, toIsoDate } from '../../../shared/domain';
import { EXPIRY_ALERT_DAYS, alertHorizonFor } from '../domain';

import { INVENTORY_OUTBOX, type InventoryOutbox } from './ports/outbox.port';
import { LOT_REPOSITORY, type LotRepository } from './ports/repositories';

export interface ExpiryAlertResult {
  readonly checked: number;
  readonly alerted: number;
  readonly expired: number;
}

/**
 * T-322. Runs nightly across all tenants (no request context): every
 * lot with stock that expires in exactly 30 / 7 / 1 days gets an
 * outbox alert (idempotent per lot + horizon); lots that expired
 * yesterday get one final "expired" alert.
 */
@Injectable()
export class ExpiryAlertUseCase {
  private static readonly BATCH = 500;

  constructor(
    @Inject(LOT_REPOSITORY) private readonly lots: LotRepository,
    @Inject(INVENTORY_OUTBOX) private readonly outbox: InventoryOutbox,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<ExpiryAlertResult> {
    const now = this.clock.now();
    const today = toIsoDate(now);
    const horizon = Math.max(...EXPIRY_ALERT_DAYS);
    const rows = await this.lots.listExpiringAllTenants(
      addDays(today, horizon),
      ExpiryAlertUseCase.BATCH,
    );
    let alerted = 0;
    let expired = 0;
    for (const r of rows) {
      const expiryDate = r.lot.expiryDate;
      if (expiryDate === null || r.onHandQty <= 0n) continue;
      const days = alertHorizonFor(expiryDate, today);
      const justExpired = expiryDate === addDays(today, -1);
      if (days === null && !justExpired) continue;
      await this.outbox.enqueue({
        idempotencyKey: `lot:${r.lot.id}:${justExpired ? 'expired' : `d${String(days)}`}`,
        event: {
          type: justExpired
            ? 'inventory.lot_expired.v1'
            : 'inventory.lot_expiring.v1',
          aggregateId: r.lot.id,
          tenantId: r.lot.tenantId,
          occurredAt: now,
          itemId: r.lot.itemId,
          lotNumber: r.lot.lotNumber,
          expiryDate,
          daysToExpiry: justExpired ? -1 : (days ?? 0),
          onHandQty: r.onHandQty,
          actor: 'system',
        },
      });
      if (justExpired) expired += 1;
      else alerted += 1;
    }
    return { checked: rows.length, alerted, expired };
  }
}
