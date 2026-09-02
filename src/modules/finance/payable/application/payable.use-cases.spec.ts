import { MatchVarianceError } from '../domain';

import {
  CreatePaymentBatchUseCase,
  CreatePaymentVoucherUseCase,
  PostPaymentBatchUseCase,
  PostPaymentVoucherUseCase,
  VoidPaymentVoucherUseCase,
  VoucherPoster,
} from './payment.use-cases';
import { ApAgingUseCase, CashForecastUseCase } from './report.use-cases';
import {
  FakeApTax,
  FakeNumbers,
  FakePostingGate,
  FakeTx,
  FixedClock,
  InMemoryApOutbox,
  InMemoryApRefLookup,
  InMemoryBatches,
  InMemoryCertificates,
  InMemoryVendorInvoices,
  InMemoryVouchers,
  tenantOf,
} from './testing/in-memory';
import {
  CreateVendorInvoiceUseCase,
  PostVendorInvoiceUseCase,
} from './vendor-invoice.use-cases';

describe('Payable use cases', () => {
  const tenant = tenantOf('t1', 'alice');
  const tx = new FakeTx();
  let invoices: InMemoryVendorInvoices;
  let vouchers: InMemoryVouchers;
  let batches: InMemoryBatches;
  let certificates: InMemoryCertificates;
  let refs: InMemoryApRefLookup;
  let outbox: InMemoryApOutbox;
  let clock: FixedClock;
  let numbers: FakeNumbers;
  let createInvoice: CreateVendorInvoiceUseCase;
  let postInvoice: PostVendorInvoiceUseCase;
  let createVoucher: CreatePaymentVoucherUseCase;
  let poster: VoucherPoster;

  beforeEach(() => {
    invoices = new InMemoryVendorInvoices();
    vouchers = new InMemoryVouchers();
    batches = new InMemoryBatches();
    certificates = new InMemoryCertificates();
    refs = new InMemoryApRefLookup();
    outbox = new InMemoryApOutbox();
    clock = new FixedClock(new Date('2026-09-02T03:00:00.000Z'));
    numbers = new FakeNumbers();
    const gate = new FakePostingGate();
    refs.companies.set('co', {
      id: 'co',
      legalName: 'Demo',
      taxId: null,
      baseCurrency: 'THB',
      isActive: true,
    });
    refs.vendors.set('v1', {
      id: 'v1',
      code: 'VEND-001',
      name: 'Steel Co',
      taxId: '0105557777777',
      paymentTermsDays: 45,
      isActive: true,
    });
    refs.items.set('raw', {
      id: 'raw',
      sku: 'RAW-A',
      name: 'Raw A',
      defaultUomCode: 'KG',
      isActive: true,
    });
    refs.orders.set('po1', {
      id: 'po1',
      number: 'PO-1',
      companyId: 'co',
      vendorId: 'v1',
      currency: 'THB',
      paymentTermsDays: 45,
      status: 'RECEIVED',
      lines: [
        {
          id: 'pol1',
          itemId: 'raw',
          itemSku: 'RAW-A',
          description: 'Raw A',
          uomCode: 'KG',
          quantity: 100n,
          receivedQty: 100n,
          unitPriceMinor: 50_00n,
          discountBp: 0,
          taxCodeId: 'tax-vat7',
          taxCode: 'VAT7',
          taxRateBp: 700,
        },
      ],
    });
    createInvoice = new CreateVendorInvoiceUseCase(
      invoices,
      refs,
      new FakeApTax(),
      numbers,
      tx,
      tenant,
      clock,
    );
    postInvoice = new PostVendorInvoiceUseCase(
      invoices,
      gate,
      outbox,
      tx,
      tenant,
      clock,
    );
    createVoucher = new CreatePaymentVoucherUseCase(
      vouchers,
      invoices,
      refs,
      numbers,
      tx,
      tenant,
      clock,
    );
    poster = new VoucherPoster(
      vouchers,
      invoices,
      certificates,
      numbers,
      gate,
      outbox,
      tenant,
    );
  });

  it('matches against PO + receipts, blocks variances unless accepted, and pays with WHT + certificate', async () => {
    const bad = await createInvoice.execute({
      vendorInvoiceNumber: 'INV-1',
      purchaseOrderId: 'po1',
      lines: [
        { purchaseOrderLineId: 'pol1', quantity: 100n, unitPriceMinor: 52_00n },
      ],
    });
    expect(bad.snapshot().matchStatus).toBe('VARIANCE');
    await expect(
      postInvoice.execute({ invoiceId: bad.id }),
    ).rejects.toBeInstanceOf(MatchVarianceError);
    expect(
      (await postInvoice.execute({ invoiceId: bad.id, acceptVariance: true }))
        .status,
    ).toBe('OPEN');

    const good = await createInvoice
      .execute({
        vendorInvoiceNumber: 'INV-2',
        purchaseOrderId: 'po1',
        lines: [
          {
            purchaseOrderLineId: 'pol1',
            quantity: 0n + 100n,
            whtTaxCodeId: 'tax-wht3',
          },
        ],
      })
      .catch(() => null);
    // pol1 is fully invoiced by INV-1 -> a second full invoice is a quantity variance
    expect(good?.snapshot().matchStatus).toBe('VARIANCE');

    const service = await createInvoice.execute({
      companyId: 'co',
      vendorId: 'v1',
      vendorInvoiceNumber: 'SVC-9',
      lines: [
        {
          itemId: 'raw',
          quantity: 1n,
          unitPriceMinor: 10_000_00n,
          whtTaxCodeId: 'tax-wht3',
        },
      ],
    });
    expect(service.snapshot()).toMatchObject({
      matchStatus: 'UNMATCHED',
      totalMinor: 10_700_00n,
      number: 'AP-202609-0003',
    });
    await postInvoice.execute({ invoiceId: service.id, acceptVariance: true });

    const pv = await createVoucher.execute({
      companyId: 'co',
      vendorId: 'v1',
      method: 'TRANSFER',
      allocations: [{ invoiceId: service.id }],
    });
    expect(pv.snapshot()).toMatchObject({
      grossMinor: 10_700_00n,
      whtMinor: 300_00n,
      netPaidMinor: 10_400_00n,
    });
    const postVoucher = new PostPaymentVoucherUseCase(
      vouchers,
      poster,
      tx,
      tenant,
      clock,
    );
    await postVoucher.execute({ voucherId: pv.id });
    expect((await invoices.findById('t1', service.id))?.status).toBe('PAID');
    const cert = await certificates.findByVoucher('t1', pv.id);
    expect(cert).toMatchObject({
      number: 'WHT-202609-0001',
      pndForm: 'PND53',
      totalBaseMinor: 10_000_00n,
      totalTaxMinor: 300_00n,
      vendorTaxId: '0105557777777',
    });
    await new VoidPaymentVoucherUseCase(
      vouchers,
      poster,
      tx,
      tenant,
      clock,
    ).execute({ voucherId: pv.id });
    expect((await invoices.findById('t1', service.id))?.status).toBe('OPEN');
    expect((await certificates.findByVoucher('t1', pv.id))?.isVoid).toBe(true);
    expect(outbox.rows.map((r) => r.event.type)).toEqual([
      'vendor_invoice.posted.v1',
      'vendor_invoice.posted.v1',
      'payment_voucher.posted.v1',
      'payment_voucher.voided.v1',
    ]);
  });

  it('a batch pays every open invoice due by the date, one voucher per vendor; aging and forecast see the rest', async () => {
    const a = await createInvoice.execute({
      companyId: 'co',
      vendorId: 'v1',
      vendorInvoiceNumber: 'A',
      invoiceDate: '2026-07-01',
      paymentTermsDays: 30,
      lines: [{ itemId: 'raw', quantity: 1n, unitPriceMinor: 1_000_00n }],
    });
    const b = await createInvoice.execute({
      companyId: 'co',
      vendorId: 'v1',
      vendorInvoiceNumber: 'B',
      invoiceDate: '2026-09-01',
      paymentTermsDays: 60,
      lines: [{ itemId: 'raw', quantity: 1n, unitPriceMinor: 2_000_00n }],
    });
    await postInvoice.execute({ invoiceId: a.id, acceptVariance: true });
    await postInvoice.execute({ invoiceId: b.id, acceptVariance: true });
    const aging = await new ApAgingUseCase(invoices, tenant, clock).execute({
      asOf: '2026-09-02',
    });
    expect(aging.rows[0]).toMatchObject({
      partyId: 'v1',
      totalMinor: 3_210_00n,
      buckets: { D31_60: 1_070_00n, CURRENT: 2_140_00n },
    });
    const forecast = await new CashForecastUseCase(
      invoices,
      tenant,
      clock,
    ).execute({ asOf: '2026-09-02', weeks: 4 });
    expect(
      forecast.buckets.find((x) => x.label === 'OVERDUE')?.amountMinor,
    ).toBe(1_070_00n);
    expect(forecast.buckets.find((x) => x.label === 'LATER')?.amountMinor).toBe(
      2_140_00n,
    );

    const createBatch = new CreatePaymentBatchUseCase(
      batches,
      vouchers,
      invoices,
      refs,
      createVoucher,
      numbers,
      tx,
      tenant,
      clock,
    );
    const { batch, vouchers: created } = await createBatch.execute({
      companyId: 'co',
      method: 'TRANSFER',
      paymentDate: '2026-09-02',
    });
    expect(created).toHaveLength(1);
    expect(batch.snapshot()).toMatchObject({
      voucherCount: 1,
      totalNetMinor: 1_070_00n,
    });
    const postBatch = new PostPaymentBatchUseCase(
      batches,
      vouchers,
      poster,
      tx,
      tenant,
      clock,
    );
    expect(
      (await postBatch.execute({ batchId: batch.id })).snapshot().status,
    ).toBe('POSTED');
    expect((await invoices.findById('t1', a.id))?.status).toBe('PAID');
    expect((await invoices.findById('t1', b.id))?.status).toBe('OPEN');
  });
});
