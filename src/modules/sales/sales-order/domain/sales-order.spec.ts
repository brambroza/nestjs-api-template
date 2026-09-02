import type { DocumentLineInput } from '../../../../shared/domain';

import { DeliveryNote, InvalidDeliveryNoteError } from './delivery-note';
import {
  ApprovalPendingError,
  CreditLimitExceededError,
  CreditStatus,
  IllegalSalesOrderTransitionError,
  OverDeliveryError,
  SalesOrder,
  SalesOrderHasDeliveriesError,
  SalesOrderStatus,
} from './sales-order';

describe('SalesOrder', () => {
  const now = new Date('2026-09-02T03:00:00.000Z');
  const line = (id: string, quantity = 10n): DocumentLineInput => ({
    id,
    itemId: 'item-fin-a',
    itemSku: 'FIN-A',
    description: 'Finished Product A',
    uomCode: 'PCS',
    quantity,
    unitPriceMinor: 1_400_00n,
    priceSource: 'PRICE_LIST',
    priceListId: 'pl',
    discountBp: 0,
    taxCodeId: 'tax-vat7',
    taxCode: 'VAT7',
    taxRateBp: 700,
  });
  const make = (lines = [line('l1'), line('l2', 4n)]) =>
    SalesOrder.create({
      id: 'so1',
      tenantId: 't',
      companyId: 'co',
      number: 'SO-202609-0001',
      customerId: 'c1',
      currency: 'THB',
      orderDate: '2026-09-02',
      paymentTermsDays: 30,
      createdBy: 'alice',
      lines,
      now,
    });
  const ok = { status: CreditStatus.Ok, exposureMinor: 20_972_00n };
  const auto = { approvalRequestId: 'apr-1', approval: 'APPROVED' as const };
  const pending = { approvalRequestId: 'apr-1', approval: 'PENDING' as const };

  it('auto-approved submit goes straight to CONFIRMED', () => {
    const so = make().submit({
      credit: ok,
      outcome: auto,
      creditLimitMinor: 0n,
      now,
    });
    expect(so.snapshot()).toMatchObject({
      status: SalesOrderStatus.Confirmed,
      approvalRequestId: 'apr-1',
      creditStatus: 'OK',
      totalMinor: 20_972_00n,
      confirmedAt: now,
    });
  });

  it('a credit breach needs a human: blocked when auto-approved, waits otherwise', () => {
    const exceeded = {
      status: CreditStatus.Exceeded,
      exposureMinor: 5_000_000_00n,
    };
    expect(() =>
      make().submit({
        credit: exceeded,
        outcome: auto,
        creditLimitMinor: 1_000_000_00n,
        now,
      }),
    ).toThrow(CreditLimitExceededError);
    const so = make().submit({
      credit: exceeded,
      outcome: pending,
      creditLimitMinor: 1_000_000_00n,
      now,
    });
    expect(so.status).toBe(SalesOrderStatus.PendingApproval);
    expect(() => so.applyApprovalOutcome('PENDING', now)).toThrow(
      ApprovalPendingError,
    );
    expect(so.applyApprovalOutcome('APPROVED', now).status).toBe(
      SalesOrderStatus.Confirmed,
    );
    const rejected = so.applyApprovalOutcome('REJECTED', now);
    expect(rejected.status).toBe(SalesOrderStatus.Rejected);
    expect(rejected.reopen(now).snapshot()).toMatchObject({
      status: SalesOrderStatus.Draft,
      approvalRequestId: null,
      creditStatus: 'NOT_CHECKED',
    });
    expect(so.applyApprovalOutcome('CANCELLED', now).status).toBe(
      SalesOrderStatus.Draft,
    );
  });

  it('records partial then complete deliveries and forbids over-delivery', () => {
    const so = make().submit({
      credit: ok,
      outcome: auto,
      creditLimitMinor: 0n,
      now,
    });
    const partial = so.recordDelivery(
      [{ salesOrderLineId: 'l1', quantity: 6n }],
      now,
    );
    expect(partial.status).toBe(SalesOrderStatus.PartiallyDelivered);
    expect(partial.remainingQty('l1')).toBe(4n);
    expect(() =>
      partial.recordDelivery([{ salesOrderLineId: 'l1', quantity: 5n }], now),
    ).toThrow(OverDeliveryError);
    expect(() => partial.cancel(null, now)).toThrow(
      SalesOrderHasDeliveriesError,
    );
    const done = partial.recordDelivery(
      [
        { salesOrderLineId: 'l1', quantity: 4n },
        { salesOrderLineId: 'l2', quantity: 4n },
      ],
      now,
    );
    expect(done.status).toBe(SalesOrderStatus.Delivered);
    expect(() =>
      done.recordDelivery([{ salesOrderLineId: 'l1', quantity: 1n }], now),
    ).toThrow(IllegalSalesOrderTransitionError);
    expect(() =>
      make().recordDelivery([{ salesOrderLineId: 'l1', quantity: 1n }], now),
    ).toThrow(IllegalSalesOrderTransitionError);
  });

  it('cancel works from DRAFT / PENDING / CONFIRMED without deliveries only', () => {
    expect(make().cancel('changed mind', now).snapshot().cancelReason).toBe(
      'changed mind',
    );
    const confirmed = make().submit({
      credit: ok,
      outcome: auto,
      creditLimitMinor: 0n,
      now,
    });
    expect(confirmed.cancel(null, now).status).toBe(SalesOrderStatus.Cancelled);
    expect(() => confirmed.cancel(null, now).cancel(null, now)).toThrow(
      IllegalSalesOrderTransitionError,
    );
  });
});

describe('DeliveryNote', () => {
  const now = new Date('2026-09-05T03:00:00.000Z');
  const make = (
    lines = [
      {
        id: 'd1',
        salesOrderLineId: 'l1',
        itemId: 'i',
        itemSku: 'FIN-A',
        uomCode: 'PCS',
        quantity: 3n,
      },
    ],
  ) =>
    DeliveryNote.create({
      id: 'dn1',
      tenantId: 't',
      salesOrderId: 'so1',
      number: 'DN-202609-0001',
      deliveryDate: '2026-09-05',
      createdBy: 'alice',
      lines,
      now,
    });

  it('ships once, cancels only while draft', () => {
    const shipped = make().ship(now);
    expect(shipped.snapshot()).toMatchObject({
      status: 'SHIPPED',
      shippedAt: now,
    });
    expect(() => shipped.cancel(now)).toThrow(/SHIPPED -> CANCELLED/);
    expect(make().cancel(now).status).toBe('CANCELLED');
  });

  it('rejects empty, zero-quantity and duplicate lines', () => {
    expect(() => make([])).toThrow(InvalidDeliveryNoteError);
    expect(() =>
      make([
        {
          id: 'd1',
          salesOrderLineId: 'l1',
          itemId: 'i',
          itemSku: 'x',
          uomCode: 'PCS',
          quantity: 0n,
        },
      ]),
    ).toThrow(InvalidDeliveryNoteError);
    expect(() =>
      make([
        {
          id: 'd1',
          salesOrderLineId: 'l1',
          itemId: 'i',
          itemSku: 'x',
          uomCode: 'PCS',
          quantity: 1n,
        },
        {
          id: 'd2',
          salesOrderLineId: 'l1',
          itemId: 'i',
          itemSku: 'x',
          uomCode: 'PCS',
          quantity: 1n,
        },
      ]),
    ).toThrow(InvalidDeliveryNoteError);
  });
});
