import { DomainError } from '../../../../shared/errors';

/**
 * Calendar dates as 'YYYY-MM-DD'. Fiscal periods and FX rates are
 * date-valued, not instant-valued: "2026-09-01" means the same
 * accounting day in every timezone. Strings compare lexicographically,
 * which is chronological for this format, and never pick up a
 * timezone offset on the way to the DB.
 */
export type IsoDate = string;

export class InvalidDateError extends DomainError {
  readonly code = 'DOMAIN.INVALID_DATE';
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(v: string): boolean {
  const m = ISO_RE.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  return (
    back.getUTCFullYear() === y &&
    back.getUTCMonth() === mo - 1 &&
    back.getUTCDate() === d
  );
}

export function assertIsoDate(v: string, field = 'date'): IsoDate {
  if (!isIsoDate(v)) {
    throw new InvalidDateError(`${field} must be a valid YYYY-MM-DD date`);
  }
  return v;
}

export function toIsoDate(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

export function fromIsoDate(iso: IsoDate): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function fromUtc(y: number, m: number, d: number): IsoDate {
  return toIsoDate(new Date(Date.UTC(y, m, d)));
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const d = fromIsoDate(iso);
  return fromUtc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days);
}

/** Month arithmetic that clamps to the last day of the target month. */
export function addMonths(iso: IsoDate, months: number): IsoDate {
  const d = fromIsoDate(iso);
  const day = d.getUTCDate();
  const firstOfTarget = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1),
  );
  const lastDay = new Date(
    Date.UTC(
      firstOfTarget.getUTCFullYear(),
      firstOfTarget.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate();
  return fromUtc(
    firstOfTarget.getUTCFullYear(),
    firstOfTarget.getUTCMonth(),
    Math.min(day, lastDay),
  );
}

export function dayOfMonth(iso: IsoDate): number {
  return fromIsoDate(iso).getUTCDate();
}
