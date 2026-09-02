import type { Clock } from '../../../shared/clock';
import type { OutboxStore } from '../application/ports/outbox-store.port';

import { OutboxReclaimerCron } from './outbox-reclaimer.cron';

class FixedClock implements Clock {
  constructor(private t: Date) {}
  now(): Date {
    return new Date(this.t.getTime());
  }
}

class SpyStore implements OutboxStore {
  reclaimCalls: Array<{ staleBefore: Date }> = [];
  reclaimReturn = 0;
  async claimPending() {
    return { claimed: [] };
  }
  async markDelivered() {
    /* noop */
  }
  async markFailure() {
    /* noop */
  }
  async reclaimStalled(staleBefore: Date): Promise<number> {
    this.reclaimCalls.push({ staleBefore });
    return this.reclaimReturn;
  }
}

describe('OutboxReclaimerCron (ADR 0003 §2.3)', () => {
  const now = new Date('2026-01-01T12:00:00Z');

  it('reclaims rows whose lease is older than the 5-minute stalled timeout', async () => {
    const store = new SpyStore();
    store.reclaimReturn = 3;
    const cron = new OutboxReclaimerCron(store, new FixedClock(now));

    await cron.tick();

    expect(store.reclaimCalls).toHaveLength(1);
    const cutoff = store.reclaimCalls[0]!.staleBefore;
    expect(now.getTime() - cutoff.getTime()).toBe(5 * 60 * 1000);
  });

  it('swallows exceptions from the store — a bad tick must not kill the cron', async () => {
    const store = new SpyStore();
    store.reclaimStalled = async () => {
      throw new Error('DB unreachable');
    };
    const cron = new OutboxReclaimerCron(store, new FixedClock(now));

    await expect(cron.tick()).resolves.toBeUndefined();
  });

  it('is a no-op when no rows are stalled', async () => {
    const store = new SpyStore();
    store.reclaimReturn = 0;
    const cron = new OutboxReclaimerCron(store, new FixedClock(now));

    await cron.tick();

    expect(store.reclaimCalls).toHaveLength(1);
  });
});
