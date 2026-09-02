import type { DocumentLineInput } from '../../../../shared/domain';

import { agingBucket, buildAging } from './aging';
import { proposeAllocations } from './auto-match';
import {
  IllegalInvoiceTransitionError,
  InvalidReceiptError,
  SettlementExceedsBalanceError,
} from './errors';
import { buildPromptPayPayload, crc16ccitt } from './promptpay';
import { Receipt } from './receipt';
import { InvoiceStatus, SalesInvoice } from './sales-invoice';

const now = new Date('2026-09-02T03:00:00.000Z');
const line = (
  id: string,
  quantity: bigint,
  price: bigint,
): DocumentLineInput & { salesOrderLineId: string | null } => ({
  id,
  itemId: 'i',
  itemSku: 'FIN-A',
  description: 'Fin A',
  uomCode: 'PCS',
  quantity,
  unitPriceMinor: price,
  priceSource: 'MANUAL',
  priceListId: null,
  discountBp: 0,
  taxCodeId: 'tax-vat7',
  taxCode: 'VAT7',
  taxRateBp: 700,
  salesOrderLineId: null,
});
const invoice = () =>
  SalesInvoice.create({
    id: 'inv',
    tenantId: 't',
    companyId: 'co',
    branchId: 'br',
    customerId: 'c1',
    customerName: 'Demo Co',
    customerTaxId: '0105551234567',
    customerBranchNumber: '00000',
    billingAddress: null,
    currency: 'THB',
    invoiceDate: '2026-09-02',
    paymentTermsDays: 30,
    createdBy: 'u',
    lines: [line('l1', 10n, 1_000_00n)],
    now,
  });

describe('SalesInvoice', () => {
  it('issues with a number, settles partially then fully, and refuses over-settlement', () => {
    const d = invoice();
    expect(d.snapshot()).toMatchObject({
      status: 'DRAFT',
      dueDate: '2026-10-02',
      totalMinor: 10_700_00n,
      balanceMinor: 10_700_00n,
    });
    const issued = d.issue('IV00000-202609-00001', now);
    expect(issued.snapshot().number).toBe('IV00000-202609-00001');
    const part = issued.applySettlement(700_00n, now);
    expect(part.snapshot()).toMatchObject({
      status: InvoiceStatus.PartiallyPaid,
      balanceMinor: 10_000_00n,
    });
    expect(() => part.applySettlement(10_000_01n, now)).toThrow(
      SettlementExceedsBalanceError,
    );
    const paid = part.applySettlement(10_000_00n, now);
    expect(paid.status).toBe(InvoiceStatus.Paid);
    expect(() => paid.void('x', now)).toThrow(IllegalInvoiceTransitionError);
    expect(paid.reverseSettlement(10_000_00n, now).status).toBe(
      InvoiceStatus.PartiallyPaid,
    );
    expect(issued.void('duplicate', now).snapshot()).toMatchObject({
      status: 'VOID',
      balanceMinor: 0n,
    });
  });
});

describe('Receipt', () => {
  it('validates method-specific fields and allocation limits', () => {
    const base = {
      id: 'r',
      tenantId: 't',
      companyId: 'co',
      number: 'RC-1',
      customerId: 'c1',
      currency: 'THB',
      receiptDate: '2026-09-05',
      amountMinor: 9_700_00n,
      whtMinor: 300_00n,
      createdBy: 'u',
      now,
    };
    expect(() => Receipt.create({ ...base, method: 'CHEQUE' })).toThrow(
      InvalidReceiptError,
    );
    expect(() => Receipt.create({ ...base, method: 'TRANSFER' })).toThrow(
      InvalidReceiptError,
    );
    const r = Receipt.create({
      ...base,
      method: 'TRANSFER',
      reference: 'KBANK 1234',
    });
    expect(r.settlementMinor).toBe(10_000_00n);
    expect(() =>
      r.setAllocations(
        [{ id: 'a', invoiceId: 'inv', amountMinor: 10_000_01n }],
        now,
      ),
    ).toThrow(InvalidReceiptError);
    const allocated = r.setAllocations(
      [{ id: 'a', invoiceId: 'inv', amountMinor: 10_000_00n }],
      now,
    );
    expect(allocated.unappliedMinor).toBe(0n);
    expect(allocated.post(now).status).toBe('POSTED');
  });
});

describe('PromptPay payload', () => {
  it('uses CRC-16/CCITT-FALSE and encodes a dynamic mobile payload', () => {
    expect(crc16ccitt('123456789')).toBe('29B1');
    const p = buildPromptPayPayload({
      proxy: '081-234-5678',
      amountMinor: 10_700_00n,
    });
    expect(p.startsWith('000201010212')).toBe(true);
    expect(p).toContain('2937' + '0016A000000677010111' + '01130066812345678');
    expect(p).toContain('5303764');
    expect(p).toContain('540810700.00');
    expect(p).toContain('5802TH');
    expect(p.slice(-8, -4)).toBe('6304');
    expect(crc16ccitt(p.slice(0, -4))).toBe(p.slice(-4));
    expect(
      buildPromptPayPayload({ proxy: '0105551234567', amountMinor: null }),
    ).toContain('01021129');
  });
});

describe('aging and auto-match', () => {
  it('buckets by days overdue and proposes reference > exact > FIFO', () => {
    expect([0, 1, 30, 31, 60, 61, 90, 91].map(agingBucket)).toEqual([
      'CURRENT',
      'D1_30',
      'D1_30',
      'D31_60',
      'D31_60',
      'D61_90',
      'D61_90',
      'OVER_90',
    ]);
    const rows = buildAging(
      [
        {
          customerId: 'c1',
          invoiceId: 'a',
          number: 'IV-1',
          dueDate: '2026-08-01',
          balanceMinor: 100n,
        },
        {
          customerId: 'c1',
          invoiceId: 'b',
          number: 'IV-2',
          dueDate: '2026-09-30',
          balanceMinor: 50n,
        },
        {
          customerId: 'c2',
          invoiceId: 'c',
          number: 'IV-3',
          dueDate: '2026-05-01',
          balanceMinor: 700n,
        },
      ],
      '2026-09-02',
    );
    expect(rows[0]).toMatchObject({
      customerId: 'c2',
      totalMinor: 700n,
      buckets: { OVER_90: 700n },
    });
    expect(rows[1]).toMatchObject({
      customerId: 'c1',
      buckets: { D31_60: 100n, CURRENT: 50n },
    });

    const open = [
      {
        invoiceId: 'a',
        number: 'IV-1',
        dueDate: '2026-08-01',
        balanceMinor: 100n,
      },
      {
        invoiceId: 'b',
        number: 'IV-2',
        dueDate: '2026-07-01',
        balanceMinor: 250n,
      },
      {
        invoiceId: 'c',
        number: 'IV-3',
        dueDate: '2026-09-01',
        balanceMinor: 60n,
      },
    ];
    expect(
      proposeAllocations(250n, 'payment IV-3 thanks', open).allocations,
    ).toEqual([
      { invoiceId: 'c', amountMinor: 60n, rule: 'REFERENCE' },
      { invoiceId: 'b', amountMinor: 190n, rule: 'FIFO' },
    ]);
    expect(proposeAllocations(100n, null, open).allocations).toEqual([
      { invoiceId: 'a', amountMinor: 100n, rule: 'EXACT_AMOUNT' },
    ]);
    expect(proposeAllocations(500n, null, open).unappliedMinor).toBe(90n);
  });
});
