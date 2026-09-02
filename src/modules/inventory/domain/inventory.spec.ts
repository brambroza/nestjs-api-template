import {
  allocateFefo,
  applyMovement,
  availableQty,
  type StockBalanceSnapshot,
} from './balance';
import {
  applyAverageIssue,
  applyAverageReceipt,
  consumeFifo,
  type AverageCostSnapshot,
  type CostLayerSnapshot,
} from './costing';
import { ReservationExceedsStockError } from './errors';
import {
  alertHorizonFor,
  defaultExpiry,
  expiryStatus,
  normaliseLotNumber,
} from './lot';
import { normaliseSerials } from './serial';
import { StockTransfer } from './transfer';

describe('stock balance arithmetic', () => {
  const b: StockBalanceSnapshot = {
    id: 'b',
    tenantId: 't',
    warehouseId: 'w',
    itemId: 'i',
    lotId: null,
    uomCode: 'PCS',
    onHandQty: 10n,
    reservedQty: 4n,
    version: 0,
  };

  it('reserves within available and issues consuming the reservation', () => {
    expect(availableQty(b)).toBe(6n);
    const r = applyMovement(b, 'RESERVE', 6n);
    expect(r.reservedQty).toBe(10n);
    expect(() => applyMovement(r, 'RESERVE', 1n)).toThrow(
      ReservationExceedsStockError,
    );
    const issued = applyMovement(r, 'ISSUE', 7n, 7n);
    expect(issued).toMatchObject({ onHandQty: 3n, reservedQty: 3n });
    // unreserved stock cannot be issued past what is free
    expect(() => applyMovement(r, 'ISSUE', 1n)).toThrow(
      ReservationExceedsStockError,
    );
    expect(applyMovement(b, 'UNRESERVE', 4n).reservedQty).toBe(0n);
    expect(applyMovement(b, 'RECEIPT', 5n).onHandQty).toBe(15n);
  });

  it('allocates FEFO across lots and reports the shortfall', () => {
    const lots = [
      { lot: 'A', available: 3n },
      { lot: 'B', available: 0n },
      { lot: 'C', available: 5n },
    ];
    const r = allocateFefo(lots, 7n);
    expect(r.allocations.map((a) => [a.source.lot, a.qty])).toEqual([
      ['A', 3n],
      ['C', 4n],
    ]);
    expect(r.shortfall).toBe(0n);
    expect(allocateFefo(lots, 10n).shortfall).toBe(2n);
  });
});

describe('costing', () => {
  const layer = (
    id: string,
    day: number,
    qty: bigint,
    cost: bigint,
  ): CostLayerSnapshot => ({
    id,
    tenantId: 't',
    warehouseId: 'w',
    itemId: 'i',
    lotId: null,
    movementId: `m-${id}`,
    receivedAt: new Date(Date.UTC(2026, 8, day)),
    originalQty: qty,
    remainingQty: qty,
    unitCostMinor: cost,
    currency: 'THB',
  });

  it('FIFO consumes the oldest layer first and prices the issue', () => {
    const r = consumeFifo(
      [layer('new', 5, 10n, 120_00n), layer('old', 1, 4n, 100_00n)],
      6n,
    );
    expect(r.costMinor).toBe(4n * 100_00n + 2n * 120_00n);
    expect(r.updated.map((l) => [l.id, l.remainingQty])).toEqual([
      ['old', 0n],
      ['new', 8n],
    ]);
    expect(r.uncosted).toBe(0n);
    expect(consumeFifo([layer('old', 1, 4n, 100_00n)], 6n).uncosted).toBe(2n);
  });

  it('weighted average rounds half-up and unwinds on issue', () => {
    const zero: AverageCostSnapshot = {
      id: 'a',
      tenantId: 't',
      itemId: 'i',
      quantity: 0n,
      totalCostMinor: 0n,
      unitCostMinor: 0n,
      currency: 'THB',
      version: 0,
    };
    const a1 = applyAverageReceipt(zero, 3n, 100_00n); // 300.00 / 3 = 100.00
    const a2 = applyAverageReceipt(a1, 1n, 101_00n); // 401.00 / 4 = 100.25
    expect(a2.unitCostMinor).toBe(100_25n);
    const issued = applyAverageIssue(a2, 3n);
    expect(issued.costMinor).toBe(300_75n);
    expect(issued.next).toMatchObject({
      quantity: 1n,
      totalCostMinor: 100_25n,
    });
  });
});

describe('lots and serials', () => {
  it('normalises lot numbers, defaults expiry from shelf life and flags horizons', () => {
    expect(normaliseLotNumber(' lot-1 ')).toBe('LOT-1');
    expect(() => normaliseLotNumber('bad lot!')).toThrow();
    expect(defaultExpiry('2026-09-02', 365)).toBe('2027-09-02');
    expect(defaultExpiry('2026-09-02', null)).toBeNull();
    expect(expiryStatus('2026-09-01', '2026-09-02')).toBe('EXPIRED');
    expect(expiryStatus('2026-09-20', '2026-09-02')).toBe('EXPIRING_SOON');
    expect(expiryStatus('2027-01-01', '2026-09-02')).toBe('OK');
    expect(alertHorizonFor('2026-09-09', '2026-09-02')).toBe(7);
    expect(alertHorizonFor('2026-09-10', '2026-09-02')).toBeNull();
  });

  it('serial count must match quantity and be unique', () => {
    expect(normaliseSerials([' sn-1', 'sn-2'], 2n)).toEqual(['SN-1', 'SN-2']);
    expect(() => normaliseSerials(['SN-1', 'sn-1'], 2n)).toThrow(/duplicate/);
    expect(() => normaliseSerials(['SN-1'], 2n)).toThrow(/quantity/);
  });
});

describe('StockTransfer', () => {
  const now = new Date('2026-09-02T00:00:00.000Z');
  const make = () =>
    StockTransfer.create({
      id: 'tr',
      tenantId: 't',
      number: 'TR-202609-0001',
      fromWarehouseId: 'a',
      toWarehouseId: 'b',
      createdBy: 'u',
      now,
      lines: [
        {
          id: 'l1',
          itemId: 'i',
          itemSku: 'RAW-A',
          lotId: null,
          uomCode: 'KG',
          quantity: 5n,
          serialNumbers: [],
        },
      ],
    });

  it('ships with carried cost, receives once, cancels only while draft', () => {
    const shipped = make().ship(new Map([['l1', 50_00n]]), now);
    expect(shipped.snapshot()).toMatchObject({
      status: 'IN_TRANSIT',
      shippedAt: now,
    });
    expect(shipped.snapshot().lines[0]?.unitCostMinor).toBe(50_00n);
    expect(() => shipped.cancel(now)).toThrow(/IN_TRANSIT -> CANCELLED/);
    expect(shipped.receive(now).status).toBe('RECEIVED');
    expect(make().cancel(now).status).toBe('CANCELLED');
    expect(() =>
      StockTransfer.create({
        ...make().snapshot(),
        fromWarehouseId: 'a',
        toWarehouseId: 'a',
        now,
        lines: make().snapshot().lines,
      }),
    ).toThrow(/must differ/);
  });
});
