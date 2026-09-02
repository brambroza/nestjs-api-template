import { formatMinor, parseTaxMonth, toCsv, toThaiDate } from './csv';
import { buildPndReport, pndCsv } from './pnd';
import { buildPp30, pp30Csv } from './pp30';
import { buildVatReport, vatReportCsv } from './vat-report';

describe('tax exports', () => {
  it('parses a tax month and formats Thai dates / amounts', () => {
    expect(parseTaxMonth('2026-02')).toEqual({
      month: '2026-02',
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(parseTaxMonth('2026-13')).toBeNull();
    expect(toThaiDate('2026-09-02')).toBe('02/09/2569');
    expect(formatMinor(1_234_56n)).toBe('1234.56');
    expect(formatMinor(-5n)).toBe('-0.05');
    expect(toCsv(['a', 'b'], [['x,y', 'he said "hi"']])).toBe(
      '﻿a,b\r\n"x,y","he said ""hi"""\r\n',
    );
  });

  it('output VAT report signs credit notes negative and totals', () => {
    const r = buildVatReport('OUTPUT', '2026-09', [
      {
        docId: '2',
        docDate: '2026-09-05',
        docNumber: 'CN00000-202609-00001',
        kind: 'CREDIT_NOTE',
        partyName: 'B',
        partyTaxId: null,
        partyBranchNumber: null,
        baseMinor: 1_000_00n,
        vatMinor: 70_00n,
      },
      {
        docId: '1',
        docDate: '2026-09-01',
        docNumber: 'IV00000-202609-00001',
        kind: 'INVOICE',
        partyName: 'A',
        partyTaxId: '0105551234567',
        partyBranchNumber: '00000',
        baseMinor: 10_000_00n,
        vatMinor: 700_00n,
      },
    ]);
    expect(r.rows.map((x) => x.docNumber)).toEqual([
      'IV00000-202609-00001',
      'CN00000-202609-00001',
    ]);
    expect(r.totalBaseMinor).toBe(9_000_00n);
    expect(r.totalVatMinor).toBe(630_00n);
    const csv = vatReportCsv(r);
    expect(csv).toContain('ชื่อผู้ซื้อสินค้า/ผู้รับบริการ');
    expect(csv).toContain(
      '01/09/2569,IV00000-202609-00001,A,0105551234567,00000,10000.00,700.00',
    );
    expect(csv).toContain('รวม,,,9000.00,630.00');
  });

  it('PP30 nets output against input VAT into payable or excess', () => {
    const company = {
      id: 'co',
      legalName: 'Demo',
      taxId: '0105551234567',
      branchNumber: '00000',
    };
    const output = buildVatReport('OUTPUT', '2026-09', [
      {
        docId: '1',
        docDate: '2026-09-01',
        docNumber: 'IV1',
        kind: 'INVOICE',
        partyName: 'A',
        partyTaxId: null,
        partyBranchNumber: null,
        baseMinor: 10_000_00n,
        vatMinor: 700_00n,
      },
    ]);
    const input = buildVatReport('INPUT', '2026-09', [
      {
        docId: '9',
        docDate: '2026-09-03',
        docNumber: 'V-1',
        kind: 'INVOICE',
        partyName: 'S',
        partyTaxId: null,
        partyBranchNumber: null,
        baseMinor: 4_000_00n,
        vatMinor: 280_00n,
      },
    ]);
    const s = buildPp30('2026-09', company, output, input);
    expect(s).toMatchObject({
      payableMinor: 420_00n,
      excessMinor: 0n,
      outputDocuments: 1,
    });
    expect(pp30Csv(s)).toContain('8,ภาษีที่ต้องชำระเดือนนี้,420.00');
    const refund = buildPp30('2026-09', company, input, output);
    expect(refund).toMatchObject({ payableMinor: 0n, excessMinor: 420_00n });
  });

  it('PND report keeps only live certificates of the requested form', () => {
    const certs = [
      {
        number: 'WHT-202609-0002',
        pndForm: 'PND53',
        paymentDate: '2026-09-10',
        vendorName: 'Co Ltd',
        vendorTaxId: '0105551234567',
        isVoid: false,
        lines: [
          {
            incomeType: 'ค่าบริการ',
            rateBp: 300,
            baseMinor: 10_000_00n,
            taxMinor: 300_00n,
          },
          {
            incomeType: 'ค่าเช่า',
            rateBp: 500,
            baseMinor: 2_000_00n,
            taxMinor: 100_00n,
          },
        ],
      },
      {
        number: 'WHT-202609-0001',
        pndForm: 'PND53',
        paymentDate: '2026-09-02',
        vendorName: 'Void Co',
        vendorTaxId: null,
        isVoid: true,
        lines: [
          { incomeType: 'ค่าบริการ', rateBp: 300, baseMinor: 1n, taxMinor: 1n },
        ],
      },
      {
        number: 'WHT-202609-0003',
        pndForm: 'PND3',
        paymentDate: '2026-09-11',
        vendorName: 'Somchai',
        vendorTaxId: '1234567890123',
        isVoid: false,
        lines: [
          {
            incomeType: 'ค่าจ้าง',
            rateBp: 300,
            baseMinor: 5_000_00n,
            taxMinor: 150_00n,
          },
        ],
      },
    ];
    const r = buildPndReport('PND53', '2026-09', certs);
    expect(r.certificates).toBe(1);
    expect(r.rows).toHaveLength(2);
    expect(r.totalTaxMinor).toBe(400_00n);
    expect(pndCsv(r)).toContain(
      '1,0105551234567,Co Ltd,10/09/2569,ค่าบริการ,3,10000.00,300.00,1,WHT-202609-0002',
    );
    expect(buildPndReport('PND3', '2026-09', certs).totalTaxMinor).toBe(
      150_00n,
    );
  });
});
