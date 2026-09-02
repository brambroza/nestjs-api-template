import { MatchVarianceError } from './errors';
import {
  PaymentBatch,
  PaymentVoucher,
  computeWhtMinor,
  proratedBase,
} from './payment';
import { threeWayMatch } from './three-way-match';
import { VendorInvoice, type VendorInvoiceLineInput } from './vendor-invoice';
import { buildCertificateLines } from './wht-certificate';

const now = new Date('2026-09-02T03:00:00.000Z');
const line = (
  id: string,
  over: Partial<VendorInvoiceLineInput> = {},
): VendorInvoiceLineInput => ({
  id,
  itemId: 'raw',
  itemSku: 'RAW-A',
  description: 'Raw A',
  uomCode: 'KG',
  quantity: 100n,
  unitPriceMinor: 50_00n,
  priceSource: 'MANUAL',
  priceListId: null,
  discountBp: 0,
  taxCodeId: 'tax-vat7',
  taxCode: 'VAT7',
  taxRateBp: 700,
  purchaseOrderLineId: 'pol1',
  whtTaxCodeId: null,
  whtTaxCode: null,
  whtRateBp: 0,
  whtPndForm: null,
  whtIncomeType: null,
  ...over,
});

describe('three-way match', () => {
  it('flags over-receipt quantity and out-of-tolerance price', () => {
    const po = {
      orderedQty: 100n,
      unitPriceMinor: 50_00n,
      receivedQty: 60n,
      alreadyInvoicedQty: 0n,
    };
    expect(
      threeWayMatch([
        { lineRef: 'l1', invoicedQty: 60n, invoicedUnitPriceMinor: 50_40n, po },
      ]).status,
    ).toBe('MATCHED');
    const r = threeWayMatch([
      { lineRef: 'l1', invoicedQty: 61n, invoicedUnitPriceMinor: 51_00n, po },
    ]);
    expect(r.status).toBe('VARIANCE');
    expect(r.issues).toHaveLength(2);
    expect(
      threeWayMatch([
        {
          lineRef: 'l1',
          invoicedQty: 1n,
          invoicedUnitPriceMinor: 1n,
          po: null,
        },
      ]).status,
    ).toBe('UNMATCHED');
  });
});

describe('VendorInvoice + payment', () => {
  const make = (
    match: { status: 'MATCHED' | 'VARIANCE' | 'UNMATCHED'; issues: string[] },
    lines = [line('l1')],
  ) =>
    VendorInvoice.create({
      id: 'vi',
      tenantId: 't',
      companyId: 'co',
      number: 'AP-202609-0001',
      vendorInvoiceNumber: 'INV-77',
      vendorId: 'v1',
      vendorName: 'Steel Co',
      vendorTaxId: '0105557777777',
      currency: 'THB',
      invoiceDate: '2026-09-02',
      paymentTermsDays: 45,
      createdBy: 'u',
      lines,
      match,
      now,
    });

  it('posts only when matched (or variance accepted) and settles gross with WHT withheld', () => {
    const variance = make({ status: 'VARIANCE', issues: ['price'] });
    expect(() => variance.post(now)).toThrow(MatchVarianceError);
    expect(variance.post(now, true).status).toBe('OPEN');
    const inv = make({ status: 'MATCHED', issues: [] }, [
      line('l1', {
        whtTaxCode: 'WHT3',
        whtTaxCodeId: 'tax-wht3',
        whtRateBp: 300,
        whtPndForm: 'PND53',
        whtIncomeType: 'ค่าบริการ',
      }),
    ]).post(now);
    expect(inv.snapshot()).toMatchObject({
      totalMinor: 5_350_00n,
      dueDate: '2026-10-17',
    });
    expect(inv.whtBases()).toEqual([
      {
        taxCode: 'WHT3',
        rateBp: 300,
        pndForm: 'PND53',
        incomeType: 'ค่าบริการ',
        baseMinor: 5_000_00n,
      },
    ]);
    expect(computeWhtMinor(5_000_00n, 300)).toBe(150_00n);
    expect(proratedBase(5_000_00n, 2_675_00n, 5_350_00n)).toBe(2_500_00n);
    const voucher = PaymentVoucher.create({
      id: 'pv',
      tenantId: 't',
      companyId: 'co',
      number: 'PV-1',
      vendorId: 'v1',
      currency: 'THB',
      paymentDate: '2026-09-30',
      method: 'TRANSFER',
      createdBy: 'u',
      now,
      allocations: [
        { id: 'a', invoiceId: 'vi', amountMinor: 5_350_00n, whtMinor: 150_00n },
      ],
    });
    expect(voucher.snapshot()).toMatchObject({
      grossMinor: 5_350_00n,
      whtMinor: 150_00n,
      netPaidMinor: 5_200_00n,
    });
    expect(inv.applySettlement(5_350_00n, now).status).toBe('PAID');
    const cert = buildCertificateLines(
      [
        {
          taxCode: 'WHT3',
          incomeType: 'ค่าบริการ',
          rateBp: 300,
          pndForm: 'PND53',
          baseMinor: 5_000_00n,
          taxMinor: 150_00n,
        },
      ],
      () => 'x',
    );
    expect(cert).toMatchObject({ pndForm: 'PND53', totalTaxMinor: 150_00n });
    const batch = PaymentBatch.create({
      id: 'b',
      tenantId: 't',
      companyId: 'co',
      number: 'PB-1',
      paymentDate: '2026-09-30',
      method: 'TRANSFER',
      currency: 'THB',
      createdBy: 'u',
      vouchers: [voucher],
      now,
    });
    expect(batch.snapshot()).toMatchObject({
      voucherCount: 1,
      totalNetMinor: 5_200_00n,
      totalWhtMinor: 150_00n,
    });
    expect(() =>
      PaymentBatch.create({
        ...batch.snapshot(),
        vouchers: [voucher.post(now)],
        now,
      }),
    ).toThrow(/is POSTED/);
  });
});
