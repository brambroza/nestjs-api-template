/**
 * ADR 0003 §2.2.5 — exponential backoff 30s, 2m, 10m, 1h, 6h, 24h → DEAD.
 * `attempts` is the 1-based attempt number that just failed. Returns the
 * milliseconds to wait before the next attempt, or `null` when the
 * attempts cap has been reached and the row should be moved to DEAD.
 */
const BACKOFF_MS: readonly number[] = [
  30_000, 120_000, 600_000, 3_600_000, 21_600_000, 86_400_000,
];

export function nextDelayMs(
  attempts: number,
  maxAttempts: number,
): number | null {
  if (attempts >= maxAttempts) return null;
  const clamped = Math.max(1, Math.min(attempts, BACKOFF_MS.length));
  // clamped is 1..BACKOFF_MS.length, so [clamped-1] is always defined —
  // ?? falls back to the last value for TS narrowing under
  // noUncheckedIndexedAccess.
  return BACKOFF_MS[clamped - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1] ?? 0;
}

export const BACKOFF_SCHEDULE = BACKOFF_MS;
