import { addDays, isIsoDate, type IsoDate } from '../../../shared/domain';

import { InvalidMovementError } from './errors';

export interface LotSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly itemId: string;
  readonly lotNumber: string;
  readonly expiryDate: IsoDate | null;
  readonly createdAt: Date;
}

export const LOT_NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,63}$/;

export function normaliseLotNumber(v: string): string {
  const t = v.trim().toUpperCase();
  if (!LOT_NUMBER_RE.test(t)) {
    throw new InvalidMovementError(
      `lot number "${v}" is invalid (1..64 chars, A-Z 0-9 . _ - /)`,
    );
  }
  return t;
}

export function assertExpiry(v: IsoDate | null): IsoDate | null {
  if (v !== null && !isIsoDate(v))
    throw new InvalidMovementError('expiryDate must be YYYY-MM-DD');
  return v;
}

/** Receipt date + shelf life, when the item declares one and no expiry was given. */
export function defaultExpiry(
  receiptDate: IsoDate,
  shelfLifeDays: number | null,
): IsoDate | null {
  return shelfLifeDays !== null && shelfLifeDays > 0
    ? addDays(receiptDate, shelfLifeDays)
    : null;
}

export const ExpiryStatus = {
  NoExpiry: 'NO_EXPIRY',
  Ok: 'OK',
  ExpiringSoon: 'EXPIRING_SOON',
  Expired: 'EXPIRED',
} as const;
export type ExpiryStatus = (typeof ExpiryStatus)[keyof typeof ExpiryStatus];

/** Alert horizons in days (T-322): 30 / 7 / 1 before expiry. */
export const EXPIRY_ALERT_DAYS: readonly number[] = [30, 7, 1];

export function expiryStatus(
  expiryDate: IsoDate | null,
  today: IsoDate,
  soonWithinDays = 30,
): ExpiryStatus {
  if (expiryDate === null) return ExpiryStatus.NoExpiry;
  if (expiryDate < today) return ExpiryStatus.Expired;
  return expiryDate <= addDays(today, soonWithinDays)
    ? ExpiryStatus.ExpiringSoon
    : ExpiryStatus.Ok;
}

/** Which alert horizon (30/7/1) fires today for this expiry, if any. */
export function alertHorizonFor(
  expiryDate: IsoDate,
  today: IsoDate,
): number | null {
  for (const days of EXPIRY_ALERT_DAYS) {
    if (addDays(today, days) === expiryDate) return days;
  }
  return null;
}
