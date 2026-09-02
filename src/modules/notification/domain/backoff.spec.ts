import { BACKOFF_SCHEDULE, nextDelayMs } from './backoff';

describe('outbox backoff schedule (ADR 0003)', () => {
  it('progresses 30s -> 2m -> 10m -> 1h -> 6h -> 24h', () => {
    expect(BACKOFF_SCHEDULE).toEqual([
      30_000, 120_000, 600_000, 3_600_000, 21_600_000, 86_400_000,
    ]);
  });

  it('returns the correct delay for each attempt number', () => {
    expect(nextDelayMs(1, 7)).toBe(30_000);
    expect(nextDelayMs(2, 7)).toBe(120_000);
    expect(nextDelayMs(3, 7)).toBe(600_000);
    expect(nextDelayMs(4, 7)).toBe(3_600_000);
    expect(nextDelayMs(5, 7)).toBe(21_600_000);
    expect(nextDelayMs(6, 7)).toBe(86_400_000);
  });

  it('returns null once attempts >= maxAttempts (row moves to DEAD)', () => {
    expect(nextDelayMs(7, 7)).toBeNull();
    expect(nextDelayMs(8, 7)).toBeNull();
  });

  it('caps at the last table entry if attempts overflows the table', () => {
    expect(nextDelayMs(6, 20)).toBe(86_400_000);
    expect(nextDelayMs(10, 20)).toBe(86_400_000);
  });
});
