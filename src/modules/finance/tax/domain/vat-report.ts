import type { IsoDate } from '../../../../shared/domain';

import { formatMinor, toCsv, toThaiDate } from './csv';

export type VatReportKind = 'OUTPUT' | 'INPUT';
export type VatDocumentKind = 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE';

/** One tax invoice / note as the sub-ledger stores it. */
export interface VatDocument {
  readonly docId: string;
  readonly docDate: IsoDate;
  readonly docNumber: string;
  readonly kind: VatDocumentKind;
  readonly partyName: string;
  readonly partyTaxId: string | null;
  readonly partyBranchNumber: string | null;
  /** Taxable value (subtotal − discount), unsigned. */
  readonly baseMinor: bigint;
  readonly vatMinor: bigint;
}

export interface VatReportRow {
  readonly seq: number;
  readonly docDate: IsoDate;
  readonly docNumber: string;
  readonly kind: VatDocumentKind;
  readonly partyName: string;
  readonly partyTaxId: string | null;
  readonly partyBranchNumber: string | null;
  /** Signed: credit notes are negative. */
  readonly baseMinor: bigint;
  readonly vatMinor: bigint;
}

export interface VatReport {
  readonly kind: VatReportKind;
  readonly month: string;
  readonly rows: readonly VatReportRow[];
  readonly totalBaseMinor: bigint;
  readonly totalVatMinor: bigint;
}

function byDateThenNumber(a: VatDocument, b: VatDocument): number {
  if (a.docDate !== b.docDate) return a.docDate < b.docDate ? -1 : 1;
  return a.docNumber < b.docNumber ? -1 : a.docNumber > b.docNumber ? 1 : 0;
}

/** T-364: รายงานภาษีขาย / ภาษีซื้อ — one row per document, credit notes negative. */
export function buildVatReport(
  kind: VatReportKind,
  month: string,
  docs: readonly VatDocument[],
): VatReport {
  let base = 0n;
  let vat = 0n;
  const rows = [...docs].sort(byDateThenNumber).map((d, i) => {
    const sign = d.kind === 'CREDIT_NOTE' ? -1n : 1n;
    const row: VatReportRow = {
      seq: i + 1,
      docDate: d.docDate,
      docNumber: d.docNumber,
      kind: d.kind,
      partyName: d.partyName,
      partyTaxId: d.partyTaxId,
      partyBranchNumber: d.partyBranchNumber,
      baseMinor: sign * d.baseMinor,
      vatMinor: sign * d.vatMinor,
    };
    base += row.baseMinor;
    vat += row.vatMinor;
    return row;
  });
  return { kind, month, rows, totalBaseMinor: base, totalVatMinor: vat };
}

const PARTY_HEADER: Record<VatReportKind, string> = {
  OUTPUT: 'ชื่อผู้ซื้อสินค้า/ผู้รับบริการ',
  INPUT: 'ชื่อผู้ขายสินค้า/ผู้ให้บริการ',
};

export function vatReportCsv(r: VatReport): string {
  return toCsv(
    [
      'ลำดับ',
      'วัน/เดือน/ปี',
      'เลขที่ใบกำกับภาษี',
      PARTY_HEADER[r.kind],
      'เลขประจำตัวผู้เสียภาษี',
      'สาขา',
      'มูลค่าสินค้า/บริการ',
      'จำนวนเงินภาษีมูลค่าเพิ่ม',
    ],
    [
      ...r.rows.map((row) => [
        row.seq,
        toThaiDate(row.docDate),
        row.docNumber,
        row.partyName,
        row.partyTaxId,
        row.partyBranchNumber,
        formatMinor(row.baseMinor),
        formatMinor(row.vatMinor),
      ]),
      [
        '',
        '',
        '',
        'รวม',
        '',
        '',
        formatMinor(r.totalBaseMinor),
        formatMinor(r.totalVatMinor),
      ],
    ],
  );
}
