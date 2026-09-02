import {
  InvalidInvoiceError,
  NothingToInvoiceError,
  PostingPeriodClosedError,
  SettlementExceedsBalanceError,
} from '../domain';

import {
  CreateInvoiceFromSalesOrderUseCase,
  CreateNoteUseCase,
  IssueInvoiceUseCase,
} from './invoice.use-cases';
import {
  CreateReceiptUseCase,
  PostReceiptUseCase,
  VoidReceiptUseCase,
} from './receipt.use-cases';
import { ArAgingUseCase, CustomerStatementUseCase } from './report.use-cases';
import {
  FakeArLedger,
  FakeNumbers,
  FakePostingGate,
  FakeTaxNumbers,
  FakeTx,
  FixedClock,
  InMemoryArOutbox,
  InMemoryArRefLookup,
  InMemoryInvoices,
  InMemoryReceipts,
  tenantOf,
} from './testing/in-memory';

describe('Receivable use cases', () => {
  const tenant = tenantOf('t1', 'alice');
  const tx = new FakeTx();
  const glLedger = new FakeArLedger();
  let invoices: InMemoryInvoices;
  let receipts: InMemoryReceipts;
  let refs: InMemoryArRefLookup;
  let gate: FakePostingGate;
  let outbox: InMemoryArOutbox;
  let clock: FixedClock;
  let fromOrder: CreateInvoiceFromSalesOrderUseCase;
  let issue: IssueInvoiceUseCase;
  let note: CreateNoteUseCase;
  let createReceipt: CreateReceiptUseCase;
  let postReceipt: PostReceiptUseCase;

  beforeEach(() => {
    invoices = new InMemoryInvoices();
    receipts = new InMemoryReceipts();
    refs = new InMemoryArRefLookup();
    gate = new FakePostingGate();
    outbox = new InMemoryArOutbox();
    clock = new FixedClock(new Date('2026-09-02T03:00:00.000Z'));
    refs.companies.set('co', {
      id: 'co',
      legalName: 'Demo Factory Co., Ltd.',
      taxId: '0105559999999',
      baseCurrency: 'THB',
      promptPayId: '0105559999999',
      isActive: true,
    });
    refs.branches.set('br', {
      id: 'br',
      companyId: 'co',
      branchNumber: '00000',
      isActive: true,
    });
    refs.customers.set('c1', {
      id: 'c1',
      code: 'CUST-001',
      name: 'Demo Customer',
      taxId: '0105551234567',
      paymentTermsDays: 30,
      isActive: true,
    });
    refs.addresses.set('c1', {
      text: '1 Sukhumvit Rd, Bangkok 10110',
      branchNumber: '00000',
    });
    refs.orders.set('so1', {
      id: 'so1',
      number: 'SO-202609-0001',
      companyId: 'co',
      customerId: 'c1',
      currency: 'THB',
      paymentTermsDays: 30,
      status: 'DELIVERED',
      lines: [
        {
          id: 'l1',
          itemId: 'fin',
          itemSku: 'FIN-A',
          description: 'Fin A',
          uomCode: 'PCS',
          deliveredQty: 10n,
          unitPriceMinor: 1_000_00n,
          priceSource: 'PRICE_LIST',
          priceListId: 'pl',
          discountBp: 0,
          taxCodeId: 'tax-vat7',
          taxCode: 'VAT7',
          taxRateBp: 700,
        },
      ],
    });
    const taxNumbers = new FakeTaxNumbers();
    fromOrder = new CreateInvoiceFromSalesOrderUseCase(
      invoices,
      refs,
      tx,
      tenant,
      clock,
    );
    issue = new IssueInvoiceUseCase(
      invoices,
      refs,
      taxNumbers,
      gate,
      outbox,
      tx,
      tenant,
      clock,
      glLedger,
    );
    note = new CreateNoteUseCase(
      invoices,
      refs,
      taxNumbers,
      gate,
      outbox,
      tx,
      tenant,
      clock,
      glLedger,
    );
    createReceipt = new CreateReceiptUseCase(
      receipts,
      invoices,
      refs,
      new FakeNumbers(),
      tx,
      tenant,
      clock,
    );
    postReceipt = new PostReceiptUseCase(
      receipts,
      invoices,
      gate,
      outbox,
      tx,
      tenant,
      clock,
      glLedger,
    );
  });

  it('bills delivered quantities once, issues with a per-branch gapless number behind the period gate', async () => {
    const draft = await fromOrder.execute({
      salesOrderId: 'so1',
      lines: [{ salesOrderLineId: 'l1', quantity: 6n }],
    });
    expect(draft.snapshot()).toMatchObject({
      customerName: 'Demo Customer',
      customerBranchNumber: '00000',
      totalMinor: 6_420_00n,
      dueDate: '2026-10-02',
    });
    gate.closedBefore = '2026-09-03';
    await expect(issue.execute({ invoiceId: draft.id })).rejects.toBeInstanceOf(
      PostingPeriodClosedError,
    );
    gate.closedBefore = null;
    const issued = await issue.execute({ invoiceId: draft.id });
    expect(issued.snapshot().number).toBe('IV00000-202609-00001');
    expect(outbox.types).toEqual(['sales_invoice.issued.v1']);
    const rest = await fromOrder.execute({ salesOrderId: 'so1' });
    expect(rest.snapshot().lines[0]?.quantity).toBe(4n);
    await issue.execute({ invoiceId: rest.id });
    await expect(
      fromOrder.execute({ salesOrderId: 'so1' }),
    ).rejects.toBeInstanceOf(NothingToInvoiceError);
    await expect(
      fromOrder.execute({
        salesOrderId: 'so1',
        lines: [{ salesOrderLineId: 'l1', quantity: 1n }],
      }),
    ).rejects.toBeInstanceOf(InvalidInvoiceError);
  });

  it('credit notes apply to the original and receipts with WHT settle the rest; voiding reverses', async () => {
    const inv = await issue.execute({
      invoiceId: (await fromOrder.execute({ salesOrderId: 'so1' })).id,
    }); // 10,700.00
    const cn = await note.execute('CREDIT_NOTE', {
      invoiceId: inv.id,
      reason: 'RETURN',
      lines: [
        { invoiceLineId: inv.snapshot().lines[0]?.id ?? '', quantity: 1n },
      ],
    });
    expect(cn.snapshot()).toMatchObject({
      number: 'CN00000-202609-00001',
      status: 'APPLIED',
      totalMinor: 1_070_00n,
    });
    expect((await invoices.findById('t1', inv.id))?.snapshot()).toMatchObject({
      status: 'PARTIALLY_PAID',
      balanceMinor: 9_630_00n,
    });
    await expect(
      note.execute('CREDIT_NOTE', {
        invoiceId: inv.id,
        reason: 'DISCOUNT',
        lines: [
          { invoiceLineId: inv.snapshot().lines[0]?.id ?? '', quantity: 10n },
        ],
      }),
    ).rejects.toBeInstanceOf(SettlementExceedsBalanceError);

    // customer pays 9,360.00 by transfer and withholds 3 % of the net 9,000.00 = 270.00
    const r = await createReceipt.execute({
      companyId: 'co',
      customerId: 'c1',
      method: 'TRANSFER',
      amountMinor: 9_360_00n,
      whtMinor: 270_00n,
      reference: `pay ${inv.snapshot().number ?? ''}`,
      autoMatch: true,
    });
    expect(r.snapshot().allocations[0]).toMatchObject({
      invoiceId: inv.id,
      amountMinor: 9_630_00n,
    });
    await postReceipt.execute({ receiptId: r.id });
    expect((await invoices.findById('t1', inv.id))?.status).toBe('PAID');
    const voidReceipt = new VoidReceiptUseCase(
      receipts,
      invoices,
      gate,
      outbox,
      tx,
      tenant,
      clock,
      glLedger,
    );
    await voidReceipt.execute({ receiptId: r.id });
    expect((await invoices.findById('t1', inv.id))?.snapshot()).toMatchObject({
      status: 'PARTIALLY_PAID',
      balanceMinor: 9_630_00n,
    });
    expect(outbox.types).toEqual([
      'sales_invoice.issued.v1',
      'credit_note.issued.v1',
      'receipt.posted.v1',
      'receipt.voided.v1',
    ]);

    const aging = await new ArAgingUseCase(invoices, tenant, clock).execute({
      asOf: '2026-11-15',
    });
    expect(aging.rows[0]).toMatchObject({
      customerId: 'c1',
      totalMinor: 9_630_00n,
      buckets: { D31_60: 9_630_00n },
    });
    const statement = await new CustomerStatementUseCase(
      invoices,
      receipts,
      tenant,
    ).execute({ customerId: 'c1', from: '2026-09-01', to: '2026-09-30' });
    expect(statement.lines.map((l) => [l.kind, l.runningBalanceMinor])).toEqual(
      [
        ['INVOICE', 10_700_00n],
        ['CREDIT_NOTE', 9_630_00n],
      ],
    );
  });
});
