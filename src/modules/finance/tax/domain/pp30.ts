import { formatMinor, toCsv } from './csv';
import type { VatReport } from './vat-report';

export interface TaxCompany {
  readonly id: string;
  readonly legalName: string;
  readonly taxId: string | null;
  readonly branchNumber: string;
}

/** ภ.พ.30 line items for one month (T-360). Amounts in minor units. */
export interface Pp30Summary {
  readonly month: string;
  readonly company: TaxCompany;
  /** 1. ยอดขายในเดือนนี้ */
  readonly salesMinor: bigint;
  /** 5. ภาษีขายเดือนนี้ */
  readonly outputVatMinor: bigint;
  /** 6. ยอดซื้อที่มีสิทธินำภาษีซื้อมาหักในเดือนนี้ */
  readonly purchasesMinor: bigint;
  /** 7. ภาษีซื้อเดือนนี้ */
  readonly inputVatMinor: bigint;
  /** 8. ภาษีที่ต้องชำระเดือนนี้ (output > input) */
  readonly payableMinor: bigint;
  /** 9. ภาษีที่ชำระเกินเดือนนี้ (input > output) */
  readonly excessMinor: bigint;
  readonly outputDocuments: number;
  readonly inputDocuments: number;
}

export function buildPp30(
  month: string,
  company: TaxCompany,
  output: VatReport,
  input: VatReport,
): Pp30Summary {
  const net = output.totalVatMinor - input.totalVatMinor;
  return {
    month,
    company,
    salesMinor: output.totalBaseMinor,
    outputVatMinor: output.totalVatMinor,
    purchasesMinor: input.totalBaseMinor,
    inputVatMinor: input.totalVatMinor,
    payableMinor: net > 0n ? net : 0n,
    excessMinor: net < 0n ? -net : 0n,
    outputDocuments: output.rows.length,
    inputDocuments: input.rows.length,
  };
}

export function pp30Csv(s: Pp30Summary): string {
  return toCsv(
    ['ข้อ', 'รายการ', 'จำนวนเงิน'],
    [
      ['', 'ชื่อผู้ประกอบการ', s.company.legalName],
      ['', 'เลขประจำตัวผู้เสียภาษี', s.company.taxId],
      ['', 'สาขา', s.company.branchNumber],
      ['', 'เดือนภาษี', s.month],
      ['1', 'ยอดขายในเดือนนี้', formatMinor(s.salesMinor)],
      ['5', 'ภาษีขายเดือนนี้', formatMinor(s.outputVatMinor)],
      [
        '6',
        'ยอดซื้อที่มีสิทธินำภาษีซื้อมาหักในเดือนนี้',
        formatMinor(s.purchasesMinor),
      ],
      ['7', 'ภาษีซื้อเดือนนี้', formatMinor(s.inputVatMinor)],
      ['8', 'ภาษีที่ต้องชำระเดือนนี้', formatMinor(s.payableMinor)],
      ['9', 'ภาษีที่ชำระเกินเดือนนี้', formatMinor(s.excessMinor)],
    ],
  );
}
