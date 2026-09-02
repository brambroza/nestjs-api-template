import {
  IllegalQuotationTransitionError,
  InvalidQuotationError,
  Quotation,
  QuotationExpiredError,
  QuotationNotEditableError,
  QuotationStatus,
  canTransition,
  computeLine,
  type QuotationLineInput,
} from './quotation';

describe('Quotation', () => {
  const now = new Date('2026-09-02T03:00:00.000Z');
  const line = (
    over: Partial<QuotationLineInput> = {},
  ): QuotationLineInput => ({
    id: 'l1',
    itemId: 'item-fin-a',
    itemSku: 'FIN-A',
    description: 'Finished Product A',
    uomCode: 'pcs',
    quantity: 10n,
    unitPriceMinor: 1_400_00n,
    priceSource: 'PRICE_LIST',
    priceListId: 'pl-std',
    discountBp: 0,
    taxCodeId: 'tax-vat7',
    taxCode: 'VAT7',
    taxRateBp: 700,
    ...over,
  });
  const make = (
    lines: QuotationLineInput[] = [line()],
    validUntil = '2026-09-30',
  ) =>
    Quotation.create({
      id: 'q1',
      tenantId: 't',
      companyId: 'co',
      number: 'QT-202609-0001',
      customerId: 'cust-001',
      currency: 'thb',
      quoteDate: '2026-09-02',
      validUntil,
      paymentTermsDays: 30,
      createdBy: 'alice',
      lines,
      now,
    });

  it('computes per-line and header totals in satang, half-up', () => {
    const q = make([
      line(),
      line({
        id: 'l2',
        quantity: 3n,
        unitPriceMinor: 33_33n,
        discountBp: 1_250,
      }),
    ]);
    const s = q.snapshot();
    expect(s.currency).toBe('THB');
    expect(s.lines[0]).toMatchObject({
      lineNo: 1,
      uomCode: 'PCS',
      netMinor: 14_000_00n,
      taxMinor: 980_00n,
      totalMinor: 14_980_00n,
    });
    // 99.99 gross, 12.5 % discount = 12.49875 -> 12.50; net 87.49; VAT 6.1243 -> 6.12
    expect(s.lines[1]).toMatchObject({
      discountMinor: 12_50n,
      netMinor: 87_49n,
      taxMinor: 6_12n,
      totalMinor: 93_61n,
    });
    expect(s).toMatchObject({
      subtotalMinor: 14_099_99n,
      discountMinor: 12_50n,
      taxMinor: 986_12n,
      totalMinor: 15_073_61n,
      status: QuotationStatus.Draft,
      version: 0,
    });
  });

  it('rejects bad lines and headers', () => {
    expect(() => computeLine(line({ quantity: 0n }), 'THB', 1)).toThrow(
      InvalidQuotationError,
    );
    expect(() => computeLine(line({ discountBp: 10_001 }), 'THB', 1)).toThrow(
      InvalidQuotationError,
    );
    expect(() => make([line(), line()])).toThrow(InvalidQuotationError);
    expect(() => make([line()], '2026-09-01')).toThrow(InvalidQuotationError);
  });

  it('walks DRAFT -> SENT -> ACCEPTED and forbids the rest', () => {
    const sent = make().send(now);
    expect(sent.status).toBe(QuotationStatus.Sent);
    expect(sent.snapshot().sentAt).toEqual(now);
    expect(() => sent.replaceLines([line()], now)).toThrow(
      QuotationNotEditableError,
    );
    expect(() => sent.send(now)).toThrow(IllegalQuotationTransitionError);
    const accepted = sent.accept(now);
    expect(accepted.status).toBe(QuotationStatus.Accepted);
    expect(() => accepted.cancel(now)).toThrow(IllegalQuotationTransitionError);
    expect(() => make([]).send(now)).toThrow(InvalidQuotationError);
    expect(canTransition('ACCEPTED', 'DRAFT')).toBe(false);
  });

  it('cannot be sent or accepted after validUntil, and the cron flags it', () => {
    const late = new Date('2026-10-01T00:00:00.000Z');
    const sent = make().send(now);
    expect(sent.isDueForExpiry('2026-09-30')).toBe(false);
    expect(sent.isDueForExpiry('2026-10-01')).toBe(true);
    expect(() => sent.accept(late)).toThrow(QuotationExpiredError);
    expect(() => make().send(late)).toThrow(QuotationExpiredError);
    expect(sent.expire(late).status).toBe(QuotationStatus.Expired);
  });

  it('revises from SENT/REJECTED/EXPIRED with the same number and copied lines', () => {
    const rejected = make().send(now).reject('too expensive', now);
    expect(rejected.snapshot().rejectReason).toBe('too expensive');
    const props = rejected.toRevisionProps({
      id: 'q2',
      lineIds: ['l1b'],
      createdBy: 'bob',
      validUntil: '2026-10-15',
      now,
    });
    const rev = Quotation.create(props);
    expect(rev.snapshot()).toMatchObject({
      number: 'QT-202609-0001',
      revision: 2,
      status: QuotationStatus.Draft,
      totalMinor: 14_980_00n,
    });
    expect(rev.snapshot().lines[0]?.id).toBe('l1b');
    expect(() =>
      make().toRevisionProps({
        id: 'x',
        lineIds: ['a'],
        createdBy: 'b',
        validUntil: '2026-10-15',
        now,
      }),
    ).toThrow(IllegalQuotationTransitionError);
  });

  it('links a sales order only once accepted', () => {
    const q = make().send(now);
    expect(() => q.linkSalesOrder('so-1', now)).toThrow(
      IllegalQuotationTransitionError,
    );
    const linked = q.accept(now).linkSalesOrder('so-1', now);
    expect(linked.snapshot().salesOrderId).toBe('so-1');
    expect(() => linked.linkSalesOrder('so-2', now)).toThrow(
      InvalidQuotationError,
    );
  });
});
