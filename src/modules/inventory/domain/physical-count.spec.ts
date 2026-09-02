import {
  IllegalCountTransitionError,
  InvalidCountError,
  StockCount,
} from './physical-count';

describe('StockCount', () => {
  const now = new Date('2026-09-02T00:00:00.000Z');
  const make = () =>
    StockCount.create({
      id: 'c1',
      tenantId: 't',
      number: 'CNT-202609-0001',
      warehouseId: 'wh-main',
      createdBy: 'u',
      now,
      lines: [
        {
          id: 'l1',
          itemId: 'raw',
          itemSku: 'RAW-A',
          lotId: 'lot',
          lotNumber: 'L1',
          uomCode: 'KG',
          systemQty: 100n,
          unitCostMinor: 50_00n,
        },
        {
          id: 'l2',
          itemId: 'bolt',
          itemSku: 'BOLT',
          lotId: null,
          lotNumber: null,
          uomCode: 'PCS',
          systemQty: 10n,
          unitCostMinor: 2_00n,
        },
      ],
    });

  it('freezes system quantities, records counts, computes variance value', () => {
    const counting = make().start(now);
    expect(() => counting.submitForReview(now)).toThrow(InvalidCountError);
    const counted = counting.recordCounts(
      [
        { lineId: 'l1', countedQty: 97n },
        { lineId: 'l2', countedQty: 12n },
      ],
      now,
    );
    expect(counted.snapshot().lines.map((l) => l.varianceQty)).toEqual([
      -3n,
      2n,
    ]);
    expect(counted.varianceValueMinor).toBe(3n * 50_00n + 2n * 2_00n);
    const review = counted.submitForReview(now);
    expect(review.status).toBe('REVIEW');
    expect(review.withApproval('apr-1', now).snapshot().approvalRequestId).toBe(
      'apr-1',
    );
    expect(review.recount(now).status).toBe('COUNTING');
    expect(review.post(now).snapshot().postedAt).toEqual(now);
    expect(() => review.post(now).cancel(now)).toThrow(
      IllegalCountTransitionError,
    );
  });

  it('rejects unknown lines and negative counts', () => {
    const counting = make().start(now);
    expect(() =>
      counting.recordCounts([{ lineId: 'nope', countedQty: 1n }], now),
    ).toThrow(InvalidCountError);
    expect(() =>
      counting.recordCounts([{ lineId: 'l1', countedQty: -1n }], now),
    ).toThrow(InvalidCountError);
    expect(() =>
      make().recordCounts([{ lineId: 'l1', countedQty: 1n }], now),
    ).toThrow(IllegalCountTransitionError);
  });
});
