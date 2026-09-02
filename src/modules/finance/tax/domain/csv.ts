import type { IsoDate } from '../../../../shared/domain';

/** UTF-8 BOM so Excel (TH) opens the file as UTF-8. */
export const CSV_BOM = '﻿';

export type CsvCell = string | number | bigint | boolean | null | undefined;

export function csvEscape(v: CsvCell): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'bigint' ? v.toString() : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(
  header: readonly string[],
  rows: ReadonlyArray<readonly CsvCell[]>,
): string {
  const lines = [header, ...rows].map((r) => r.map(csvEscape).join(','));
  return `${CSV_BOM}${lines.join('\r\n')}\r\n`;
}

/** Minor units → "1234.56" (two decimals, sign kept). */
export function formatMinor(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const whole = abs / 100n;
  const frac = abs % 100n;
  return `${neg ? '-' : ''}${whole.toString()}.${frac.toString().padStart(2, '0')}`;
}

/** YYYY-MM-DD → dd/mm/yyyy with the Buddhist year (พ.ศ.). */
export function toThaiDate(iso: IsoDate): string {
  const [y, m, d] = iso.split('-');
  const be = Number(y) + 543;
  return `${d ?? ''}/${m ?? ''}/${String(be)}`;
}

export interface TaxMonth {
  readonly month: string;
  readonly from: IsoDate;
  readonly to: IsoDate;
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function parseTaxMonth(value: string): TaxMonth | null {
  const m = MONTH_RE.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return {
    month: `${String(year)}-${mm}`,
    from: `${String(year)}-${mm}-01`,
    to: `${String(year)}-${mm}-${String(last).padStart(2, '0')}`,
  };
}
