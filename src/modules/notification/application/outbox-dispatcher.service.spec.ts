import { ConfigService } from '@nestjs/config';

import type { Clock } from '../../../shared/clock';

import { OutboxStatus } from '../domain/outbox-status';
import { OutboxDispatcher } from './outbox-dispatcher.service';
import type {
  LineMessagingPort,
  LinePushOutcome,
  LinePushRequest,
} from './ports/line-messaging.port';
import type {
  ClaimResult,
  OutboxRow,
  OutboxStore,
} from './ports/outbox-store.port';

class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current.getTime());
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

class InMemoryOutboxStore implements OutboxStore {
  readonly rows = new Map<string, OutboxRow>();
  readonly delivered: Array<{ id: string; at: Date }> = [];
  readonly failures: Array<{
    id: string;
    attempts: number;
    nextAttemptAt: Date | null;
    reason: string;
  }> = [];

  seed(row: OutboxRow): void {
    this.rows.set(row.id, row);
  }

  async claimPending(_now: Date, limit: number): Promise<ClaimResult> {
    const claimed: OutboxRow[] = [];
    for (const row of this.rows.values()) {
      if (claimed.length >= limit) break;
      if (row.status === 'PENDING') {
        const leased = { ...row, status: 'IN_FLIGHT' as OutboxStatus };
        this.rows.set(row.id, leased);
        claimed.push(leased);
      }
    }
    return { claimed };
  }

  async markDelivered(id: string, at: Date): Promise<void> {
    this.delivered.push({ id, at });
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, status: 'DELIVERED' });
  }

  async markFailure(
    id: string,
    attempts: number,
    nextAttemptAt: Date | null,
    reason: string,
  ): Promise<void> {
    this.failures.push({ id, attempts, nextAttemptAt, reason });
    const row = this.rows.get(id);
    if (row) {
      this.rows.set(id, {
        ...row,
        status: nextAttemptAt === null ? 'DEAD' : 'PENDING',
        attempts,
      });
    }
  }

  async reclaimStalled(): Promise<number> {
    // Dispatcher tests don't drive time-based reclaim; the dedicated
    // reclaimer test constructs its own store.
    return 0;
  }
}

class SpyLine implements LineMessagingPort {
  readonly seen: LinePushRequest[] = [];
  constructor(private readonly outcomes: LinePushOutcome[]) {}
  async push(req: LinePushRequest): Promise<LinePushOutcome> {
    this.seen.push(req);
    return this.outcomes.shift() ?? { kind: 'sent' };
  }
}

function makeRow(overrides: Partial<OutboxRow> = {}): OutboxRow {
  return {
    id: overrides.id ?? 'row-1',
    tenantId: overrides.tenantId ?? 'tenant-a',
    eventType: overrides.eventType ?? 'production_order.approved.v1',
    aggregateId: overrides.aggregateId ?? 'ord-1',
    payload: overrides.payload ?? '{}',
    idempotencyKey: overrides.idempotencyKey ?? 'idem-key-abc',
    attempts: overrides.attempts ?? 0,
    status: overrides.status ?? OutboxStatus.PENDING,
  };
}

function makeDispatcher(
  store: OutboxStore,
  line: LineMessagingPort,
  clock: Clock,
  maxAttempts = 7,
  recipientByTenant: Record<string, string> = { 'tenant-a': 'Uxxx' },
): OutboxDispatcher {
  const config = {
    getOrThrow: (key: string) => {
      if (key === 'outbox') return { maxAttempts, pollIntervalMs: 5000 };
      if (key === 'line')
        return {
          channelAccessToken: 'x',
          channelSecret: 'y',
          apiBaseUrl: 'https://api.line.me',
          recipientByTenant,
        };
      throw new Error(`unexpected config key: ${key}`);
    },
  } as unknown as ConfigService;
  return new OutboxDispatcher(store, line, clock, config);
}

describe('OutboxDispatcher (ADR 0003)', () => {
  const now = new Date('2026-01-01T00:00:00Z');

  it('happy path: delivers a PENDING row and marks it DELIVERED', async () => {
    const store = new InMemoryOutboxStore();
    store.seed(makeRow());
    const line = new SpyLine([{ kind: 'sent' }]);
    const dispatcher = makeDispatcher(store, line, new FixedClock(now));

    await dispatcher.tick();

    expect(store.delivered).toHaveLength(1);
    expect(line.seen[0]?.idempotencyKey).toBe('idem-key-abc');
  });

  it('transient failure schedules a retry per the backoff table and stays PENDING', async () => {
    const store = new InMemoryOutboxStore();
    store.seed(makeRow({ attempts: 0 }));
    const line = new SpyLine([{ kind: 'transient', reason: 'LINE 500' }]);
    const clock = new FixedClock(now);
    const dispatcher = makeDispatcher(store, line, clock);

    await dispatcher.tick();

    expect(store.failures).toHaveLength(1);
    const f = store.failures[0]!;
    expect(f.attempts).toBe(1);
    // First retry = 30s later
    expect(f.nextAttemptAt).toEqual(new Date(now.getTime() + 30_000));
    expect(store.rows.get('row-1')?.status).toBe('PENDING');
  });

  it('exhausted attempts moves the row to DEAD with no nextAttemptAt', async () => {
    const store = new InMemoryOutboxStore();
    store.seed(makeRow({ attempts: 6 }));
    const line = new SpyLine([{ kind: 'transient', reason: 'LINE 500' }]);
    const dispatcher = makeDispatcher(store, line, new FixedClock(now), 7);

    await dispatcher.tick();

    const f = store.failures[0]!;
    expect(f.attempts).toBe(7);
    expect(f.nextAttemptAt).toBeNull();
    expect(store.rows.get('row-1')?.status).toBe('DEAD');
  });

  it('permanent failure moves to DEAD immediately without waiting for retries', async () => {
    const store = new InMemoryOutboxStore();
    store.seed(makeRow({ attempts: 0 }));
    const line = new SpyLine([
      { kind: 'permanent', reason: 'LINE 400 bad payload' },
    ]);
    const dispatcher = makeDispatcher(store, line, new FixedClock(now));

    await dispatcher.tick();

    const f = store.failures[0]!;
    expect(f.nextAttemptAt).toBeNull();
    expect(store.rows.get('row-1')?.status).toBe('DEAD');
    expect(f.reason).toMatch(/permanent/);
  });

  it('sends the same idempotency key on the retry after a transient failure', async () => {
    const store = new InMemoryOutboxStore();
    store.seed(makeRow({ attempts: 0, idempotencyKey: 'idem-XYZ' }));
    const line = new SpyLine([
      { kind: 'transient', reason: 'first attempt fails' },
      { kind: 'sent' },
    ]);
    const dispatcher = makeDispatcher(store, line, new FixedClock(now));

    // First tick: transient, row stays PENDING
    await dispatcher.tick();
    // Second tick: still the same row (staged as PENDING again), succeeds.
    await dispatcher.tick();

    expect(line.seen).toHaveLength(2);
    expect(line.seen[0]?.idempotencyKey).toBe('idem-XYZ');
    expect(line.seen[1]?.idempotencyKey).toBe('idem-XYZ');
    expect(store.delivered).toHaveLength(1);
  });

  it('a thrown exception in the LINE adapter is treated as transient', async () => {
    const store = new InMemoryOutboxStore();
    store.seed(makeRow());
    const line: LineMessagingPort = {
      push: async () => {
        throw new Error('ECONNRESET');
      },
    };
    const dispatcher = makeDispatcher(store, line, new FixedClock(now));

    await dispatcher.tick();

    const f = store.failures[0]!;
    expect(f.attempts).toBe(1);
    expect(f.nextAttemptAt).not.toBeNull();
    expect(f.reason).toMatch(/ECONNRESET/);
  });

  it('rows for a tenant with no recipient mapping go straight to DEAD (fail-loud, not silent)', async () => {
    const store = new InMemoryOutboxStore();
    store.seed(makeRow({ tenantId: 'tenant-unmapped' }));
    const line = new SpyLine([{ kind: 'sent' }]);
    const dispatcher = makeDispatcher(
      store,
      line,
      new FixedClock(now),
      7,
      { 'tenant-a': 'Uxxx' }, // tenant-unmapped absent on purpose
    );

    await dispatcher.tick();

    expect(line.seen).toHaveLength(0);
    const f = store.failures[0]!;
    expect(f.nextAttemptAt).toBeNull();
    expect(f.reason).toMatch(/LINE_RECIPIENT_MAP/);
    expect(store.rows.get('row-1')?.status).toBe('DEAD');
  });

  it('reentrant tick is a no-op while another tick is running', async () => {
    const store = new InMemoryOutboxStore();
    store.seed(makeRow());
    let inFlight = 0;
    let peak = 0;
    const line: LineMessagingPort = {
      push: async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 20));
        inFlight -= 1;
        return { kind: 'sent' };
      },
    };
    const dispatcher = makeDispatcher(store, line, new FixedClock(now));

    await Promise.all([
      dispatcher.tick(),
      dispatcher.tick(),
      dispatcher.tick(),
    ]);

    // Only one of the ticks actually did the claim + push.
    expect(store.delivered).toHaveLength(1);
    expect(peak).toBeLessThanOrEqual(1);
  });
});
