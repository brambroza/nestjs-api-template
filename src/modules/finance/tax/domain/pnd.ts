import type { IsoDate } from '../../../../shared/domain';

import { formatMinor, toCsv, toThaiDate } from './csv';

export type PndForm = 'PND3' | 'PND53';

export interface WhtCertificateFacts {
  readonly number: string;
  readonly pndForm: string;
  readonly paymentDate: IsoDate;
  readonly vendorName: string;
  readonly vendorTaxId: string | null;
  readonly isVoid: boolean;
  readonly lines: ReadonlyArray<{
    readonly incomeType: string;
    readonly rateBp: number;
    readonly baseMinor: bigint;
    readonly taxMinor: bigint;
  }>;
}

export interface PndRow {
  readonly seq: number;
  readonly certificateNumber: string;
  readonly vendorTaxId: string | null;
  readonly vendorName: string;
  readonly paymentDate: IsoDate;
  readonly incomeType: string;
  readonly rateBp: number;
  readonly baseMinor: bigint;
  readonly taxMinor: bigint;
  /** 1 = หัก ณ ที่จ่าย (the only condition this template issues). */
  readonly condition: 1;
}

export interface PndReport {
  readonly form: PndForm;
  readonly month: string;
  readonly rows: readonly PndRow[];
  readonly certificates: number;
  readonly totalBaseMinor: bigint;
  readonly totalTaxMinor: bigint;
}

/** T-361: ภ.ง.ด.3 (individuals) / ภ.ง.ด.53 (juristic) attachment rows, one per certificate line. */
export function buildPndReport(
  form: PndForm,
  month: string,
  certs: readonly WhtCertificateFacts[],
): PndReport {
  const rows: PndRow[] = [];
  let base = 0n;
  let tax = 0n;
  let certificates = 0;
  const sorted = [...certs]
    .filter((c) => !c.isVoid && c.pndForm === form)
    .sort((a, b) =>
      a.paymentDate !== b.paymentDate
        ? a.paymentDate < b.paymentDate
          ? -1
          : 1
        : a.number < b.number
          ? -1
          : 1,
    );
  for (const c of sorted) {
    certificates += 1;
    for (const l of c.lines) {
      rows.push({
        seq: rows.length + 1,
        certificateNumber: c.number,
        vendorTaxId: c.vendorTaxId,
        vendorName: c.vendorName,
        paymentDate: c.paymentDate,
        incomeType: l.incomeType,
        rateBp: l.rateBp,
        baseMinor: l.baseMinor,
        taxMinor: l.taxMinor,
        condition: 1,
      });
      base += l.baseMinor;
      tax += l.taxMinor;
    }
  }
  return {
    form,
    month,
    rows,
    certificates,
    totalBaseMinor: base,
    totalTaxMinor: tax,
  };
}

function rateText(bp: number): string {
  return (bp / 100).toFixed(2).replace(/\.?0+$/, '');
}

export function pndCsv(r: PndReport): string {
  return toCsv(
    [
      'ลำดับที่',
      'เลขประจำตัวผู้เสียภาษี',
      'ชื่อผู้ถูกหักภาษี',
      'วันเดือนปีที่จ่าย',
      'ประเภทเงินได้',
      'อัตราภาษี',
      'จำนวนเงินที่จ่าย',
      'ภาษีที่หักและนำส่ง',
      'เงื่อนไข',
      'เลขที่หนังสือรับรอง',
    ],
    [
      ...r.rows.map((row) => [
        row.seq,
        row.vendorTaxId,
        row.vendorName,
        toThaiDate(row.paymentDate),
        row.incomeType,
        rateText(row.rateBp),
        formatMinor(row.baseMinor),
        formatMinor(row.taxMinor),
        row.condition,
        row.certificateNumber,
      ]),
      [
        '',
        '',
        'รวม',
        '',
        '',
        '',
        formatMinor(r.totalBaseMinor),
        formatMinor(r.totalTaxMinor),
        '',
        '',
      ],
    ],
  );
}
