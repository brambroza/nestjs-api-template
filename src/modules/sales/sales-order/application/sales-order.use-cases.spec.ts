import {
  FakeNumbers,
  FakeTx,
  FixedClock,
  InMemoryPricing,
  InMemorySalesRefLookup,
  tenantOf,
} from '../../shared/testing';
import {
  ApprovalPendingError,
  CreditLimitExceededError,
  OverDeliveryError,
  QuotationNotConvertibleError,
  SalesOrderStatus,
} from '../domain';

import {
  CreateDeliveryNoteUseCase,
  ShipDeliveryNoteUseCase,
} from './delivery-note.use-cases';
import {
  ConfirmSalesOrderUseCase,
  CreateSalesOrderUseCase,
  SubmitSalesOrderUseCase,
} from './sales-order.use-cases';
import {
  FakeApprovalGateway,
  FakeQuotationConversion,
  InMemoryDeliveryNoteRepository,
  InMemorySalesOrderOutbox,
  InMemorySalesOrderRepository,
} from './testing/in-memory';

describe('Sales order use cases', () => {
  const tenant = tenantOf('t1', 'alice');
  const tx = new FakeTx();
  let orders: InMemorySalesOrderRepository;
  let notes: InMemoryDeliveryNoteRepository;
  let refs: InMemorySalesRefLookup;
  let pricing: InMemoryPricing;
  let approvals: FakeApprovalGateway;
  let quotations: FakeQuotationConversion;
  let outbox: InMemorySalesOrderOutbox;
  let clock: FixedClock;
  let create: CreateSalesOrderUseCase;
  let submit: SubmitSalesOrderUseCase;
  let confirm: ConfirmSalesOrderUseCase;

  beforeEach(() => {
    orders = new InMemorySalesOrderRepository();
    notes = new InMemoryDeliveryNoteRepository();
    refs = new InMemorySalesRefLookup();
    pricing = new InMemoryPricing();
    approvals = new FakeApprovalGateway();
    quotations = new FakeQuotationConversion();
    outbox = new InMemorySalesOrderOutbox();
    clock = new FixedClock(new Date('2026-09-02T03:00:00.000Z'));
    refs.companies.set('co', { id: 'co', baseCurrency: 'THB', isActive: true });
    refs.customers.set('c1', {
      id: 'c1',
      code: 'CUST-001',
      name: 'Demo',
      paymentTermsDays: 30,
      creditLimitMinor: 20_000_00n,
      isActive: true,
    });
    refs.items.set('i1', {
      id: 'i1',
      sku: 'FIN-A',
      name: 'Finished Product A',
      defaultUomCode: 'PCS',
      isActive: true,
    });
    pricing.prices.set('i1', {
      unitPriceMinor: 1_000_00n,
      currency: 'THB',
      priceListId: 'pl',
    });
    create = new CreateSalesOrderUseCase(
      orders,
      refs,
      pricing,
      quotations,
      new FakeNumbers(),
      tx,
      tenant,
      clock,
    );
    submit = new SubmitSalesOrderUseCase(
      orders,
      refs,
      approvals,
      outbox,
      tx,
      tenant,
      clock,
    );
    confirm = new ConfirmSalesOrderUseCase(
      orders,
      approvals,
      outbox,
      tx,
      tenant,
      clock,
    );
  });

  const direct = (quantity = 10n) =>
    create.execute({
      companyId: 'co',
      customerId: 'c1',
      lines: [{ itemId: 'i1', quantity }],
    });

  it('auto-approved submit confirms at once and records the credit check', async () => {
    const so = await direct(10n); // 10,700.00 incl. VAT
    const confirmed = await submit.execute({ salesOrderId: so.id });
    expect(confirmed.snapshot()).toMatchObject({
      number: 'SO-202609-0001',
      status: SalesOrderStatus.Confirmed,
      creditStatus: 'OK',
      creditExposureMinor: 10_700_00n,
      approvalRequestId: 'apr-1',
    });
    expect(approvals.submitted[0]).toMatchObject({
      documentType: 'SALES_ORDER',
      amountMinor: 10_700_00n,
    });
    expect(outbox.rows.map((r) => r.event.type)).toEqual([
      'sales_order.submitted.v1',
      'sales_order.confirmed.v1',
    ]);
  });

  it('open exposure counts: the second order breaches the limit and is blocked without a policy', async () => {
    await submit.execute({ salesOrderId: (await direct(10n)).id });
    const second = await direct(10n);
    await expect(
      submit.execute({ salesOrderId: second.id }),
    ).rejects.toBeInstanceOf(CreditLimitExceededError);
    // with an approval policy the breach goes to a human instead
    approvals.nextOutcome = 'PENDING';
    const pending = await submit.execute({ salesOrderId: second.id });
    expect(pending.snapshot()).toMatchObject({
      status: SalesOrderStatus.PendingApproval,
      creditStatus: 'EXCEEDED',
    });
    await expect(
      confirm.execute({ salesOrderId: second.id }),
    ).rejects.toBeInstanceOf(ApprovalPendingError);
    approvals.states.set(second.id, { status: 'APPROVED', requestId: 'apr-2' });
    expect((await confirm.execute({ salesOrderId: second.id })).status).toBe(
      'CONFIRMED',
    );
  });

  it('converts an ACCEPTED quotation once, at the quoted prices', async () => {
    quotations.quotations.set('q1', {
      id: 'q1',
      number: 'QT-202609-0001',
      revision: 1,
      status: 'ACCEPTED',
      companyId: 'co',
      customerId: 'c1',
      currency: 'THB',
      validUntil: '2026-09-30',
      paymentTermsDays: 45,
      notes: 'from quote',
      salesOrderId: null,
      lines: [
        {
          id: 'ql1',
          itemId: 'i1',
          itemSku: 'FIN-A',
          description: 'Finished Product A',
          uomCode: 'PCS',
          quantity: 2n,
          unitPriceMinor: 900_00n,
          priceSource: 'MANUAL',
          priceListId: null,
          discountBp: 0,
          taxCodeId: 'tax-vat7',
          taxCode: 'VAT7',
          taxRateBp: 700,
        },
      ],
    });
    const so = await create.execute({ quotationId: 'q1' });
    expect(so.snapshot()).toMatchObject({
      quotationId: 'q1',
      paymentTermsDays: 45,
      notes: 'from quote',
      totalMinor: 1_926_00n,
    });
    expect(so.snapshot().lines[0]?.unitPriceMinor).toBe(900_00n);
    expect(quotations.converted).toEqual([
      { quotationId: 'q1', salesOrderId: so.id },
    ]);
    await expect(create.execute({ quotationId: 'q1' })).rejects.toBeInstanceOf(
      QuotationNotConvertibleError,
    );
  });

  it('delivery notes ship partial quantities onto the order and never over-deliver', async () => {
    const so = await submit.execute({ salesOrderId: (await direct(10n)).id });
    const lineId = so.snapshot().lines[0]?.id ?? '';
    const createNote = new CreateDeliveryNoteUseCase(
      notes,
      orders,
      refs,
      new FakeNumbers(),
      tx,
      tenant,
      clock,
    );
    const ship = new ShipDeliveryNoteUseCase(
      notes,
      orders,
      outbox,
      tx,
      tenant,
      clock,
    );
    const dn = await createNote.execute({
      salesOrderId: so.id,
      warehouseId: 'wh-main',
      lines: [{ salesOrderLineId: lineId, quantity: 4n }],
    });
    expect(dn.snapshot().number).toBe('DN-202609-0001');
    await ship.execute({ deliveryNoteId: dn.id });
    const after = await orders.findById('t1', so.id);
    expect(after?.status).toBe(SalesOrderStatus.PartiallyDelivered);
    expect(after?.remainingQty(lineId)).toBe(6n);
    await expect(
      createNote.execute({
        salesOrderId: so.id,
        lines: [{ salesOrderLineId: lineId, quantity: 7n }],
      }),
    ).rejects.toBeInstanceOf(OverDeliveryError);
    // "deliver the rest" default
    const rest = await createNote.execute({ salesOrderId: so.id });
    expect(rest.snapshot().lines[0]?.quantity).toBe(6n);
    await ship.execute({ deliveryNoteId: rest.id });
    expect((await orders.findById('t1', so.id))?.status).toBe(
      SalesOrderStatus.Delivered,
    );
    expect(outbox.rows.at(-1)?.event).toMatchObject({
      type: 'sales_order.delivered.v1',
      complete: true,
    });
  });
});
