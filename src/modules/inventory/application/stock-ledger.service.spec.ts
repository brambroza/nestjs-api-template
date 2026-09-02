import {
  CostingMethod,
  InsufficientStockError,
  LotRequiredError,
  SerialNotAvailableError,
} from '../domain';

import { ExpiryAlertUseCase } from './expiry-alert.use-case';
import { InventoryGatewayService } from './inventory-gateway';
import { StockLedgerService } from './stock-ledger.service';
import {
  FakeTx,
  FixedClock,
  InMemoryBalances,
  InMemoryCosts,
  InMemoryInventoryLedger,
  InMemoryInventoryOutbox,
  InMemoryInventoryRefLookup,
  InMemoryLots,
  InMemoryMovements,
  InMemoryReservations,
  InMemorySerials,
  InMemoryTransfers,
  tenantOf,
} from './testing/in-memory';
import {
  CreateTransferUseCase,
  ReceiveTransferUseCase,
  ShipTransferUseCase,
} from './transfer.use-cases';

describe('StockLedgerService', () => {
  const tenant = tenantOf('t1', 'alice');
  let lots: InMemoryLots;
  let balances: InMemoryBalances;
  let movements: InMemoryMovements;
  let costs: InMemoryCosts;
  let serials: InMemorySerials;
  let reservations: InMemoryReservations;
  let refs: InMemoryInventoryRefLookup;
  let outbox: InMemoryInventoryOutbox;
  let clock: FixedClock;
  let ledger: StockLedgerService;
  let gateway: InventoryGatewayService;

  beforeEach(() => {
    lots = new InMemoryLots();
    balances = new InMemoryBalances(lots);
    movements = new InMemoryMovements();
    costs = new InMemoryCosts();
    serials = new InMemorySerials();
    reservations = new InMemoryReservations();
    refs = new InMemoryInventoryRefLookup();
    outbox = new InMemoryInventoryOutbox();
    clock = new FixedClock(new Date('2026-09-02T03:00:00.000Z'));
    refs.items.set('raw', {
      id: 'raw',
      sku: 'RAW-A',
      name: 'Raw A',
      defaultUomCode: 'KG',
      trackingPolicy: 'LOT',
      shelfLifeDays: 365,
      isActive: true,
    });
    refs.items.set('fin', {
      id: 'fin',
      sku: 'FIN-A',
      name: 'Fin A',
      defaultUomCode: 'PCS',
      trackingPolicy: 'SERIAL',
      shelfLifeDays: null,
      isActive: true,
    });
    refs.items.set('bolt', {
      id: 'bolt',
      sku: 'BOLT',
      name: 'Bolt',
      defaultUomCode: 'PCS',
      trackingPolicy: 'NONE',
      shelfLifeDays: null,
      isActive: true,
    });
    ledger = new StockLedgerService(
      balances,
      movements,
      costs,
      lots,
      serials,
      reservations,
      refs,
      outbox,
      tenant,
      clock,
      new InMemoryInventoryLedger(),
    );
    gateway = new InventoryGatewayService(ledger, refs, tenant);
  });

  const receive = (
    itemId: string,
    quantity: bigint,
    unitCostMinor: bigint,
    extra: Record<string, unknown> = {},
  ) =>
    ledger.post({
      warehouseId: 'wh-main',
      type: 'RECEIPT',
      currency: 'THB',
      referenceType: 'GOODS_RECEIPT',
      referenceId: 'grn-1',
      lines: [{ itemId, quantity, unitCostMinor, ...extra }],
    });

  it('LOT items need a lot; expiry defaults from shelf life; FEFO issues the earliest lot first at FIFO cost', async () => {
    await expect(receive('raw', 10n, 50_00n)).rejects.toBeInstanceOf(
      LotRequiredError,
    );
    await receive('raw', 10n, 50_00n, {
      lotNumber: 'late',
      expiryDate: '2027-06-01',
    });
    await receive('raw', 5n, 60_00n, {
      lotNumber: 'early',
      expiryDate: '2026-12-01',
    });
    await receive('raw', 4n, 70_00n, { lotNumber: 'auto' }); // expiry = 2027-09-02
    expect((await lots.findByNumber('t1', 'raw', 'AUTO'))?.expiryDate).toBe(
      '2027-09-02',
    );

    const issued = await ledger.post({
      warehouseId: 'wh-main',
      type: 'ISSUE',
      currency: 'THB',
      referenceType: 'SALES_ORDER',
      referenceId: 'so-1',
      lines: [{ itemId: 'raw', quantity: 7n }],
    });
    // 5 from EARLY (60.00) then 2 from LATE (50.00)
    expect(issued.map((m) => [m.quantity, m.costMinor])).toEqual([
      [5n, 300_00n],
      [2n, 100_00n],
    ]);
    const view = await balances.listByItem('t1', 'raw');
    expect(view.reduce((s, b) => s + b.balance.onHandQty, 0n)).toBe(12n);
    expect(
      outbox.rows.filter(
        (r) => r.event.type === 'inventory.movement_posted.v1',
      ),
    ).toHaveLength(5);
  });

  it('weighted average prices issues at the moving average', async () => {
    refs.method = CostingMethod.WeightedAvg;
    await receive('bolt', 3n, 100_00n);
    await receive('bolt', 1n, 101_00n);
    const [m] = await ledger.post({
      warehouseId: 'wh-main',
      type: 'ISSUE',
      currency: 'THB',
      referenceType: 'MANUAL_ISSUE',
      referenceId: 'x',
      lines: [{ itemId: 'bolt', quantity: 2n }],
    });
    expect(m?.unitCostMinor).toBe(100_25n);
    expect(m?.costMinor).toBe(200_50n);
  });

  it('reservations hold stock, are consumed by the document issue and released on cancel', async () => {
    await receive('bolt', 10n, 10_00n);
    const short = await gateway.reserve({
      referenceType: 'SALES_ORDER',
      referenceId: 'so-1',
      lines: [{ itemId: 'bolt', quantity: 11n }],
    });
    expect(short.kind).toBe('shortage');
    const ok = await gateway.reserve({
      referenceType: 'SALES_ORDER',
      referenceId: 'so-1',
      lines: [{ itemId: 'bolt', quantity: 8n }],
    });
    expect(ok).toMatchObject({ kind: 'reserved', warehouseId: 'wh-main' });
    // someone else cannot take the reserved units
    await expect(
      ledger.post({
        warehouseId: 'wh-main',
        type: 'ISSUE',
        currency: 'THB',
        referenceType: 'MANUAL_ISSUE',
        referenceId: 'y',
        lines: [{ itemId: 'bolt', quantity: 3n }],
        consumeReservations: false,
      }),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    // the reserving document can, and the hold shrinks with it
    await gateway.issue({
      referenceType: 'SALES_ORDER',
      referenceId: 'so-1',
      lines: [{ itemId: 'bolt', quantity: 5n }],
    });
    const b = await balances.findByKey('t1', 'wh-main', 'bolt', null);
    expect(b).toMatchObject({ onHandQty: 5n, reservedQty: 3n });
    expect(
      await gateway.release({
        referenceType: 'SALES_ORDER',
        referenceId: 'so-1',
      }),
    ).toBe(1);
    expect(
      (await balances.findByKey('t1', 'wh-main', 'bolt', null))?.reservedQty,
    ).toBe(0n);
  });

  it('serial items carry exactly one serial per unit and cannot be issued twice', async () => {
    await expect(
      receive('fin', 2n, 900_00n, { serialNumbers: ['S1'] }),
    ).rejects.toThrow(/serial number/);
    await receive('fin', 2n, 900_00n, { serialNumbers: ['S1', 'S2'] });
    await expect(
      receive('fin', 1n, 900_00n, { serialNumbers: ['S1'] }),
    ).rejects.toBeInstanceOf(SerialNotAvailableError);
    await ledger.post({
      warehouseId: 'wh-main',
      type: 'ISSUE',
      currency: 'THB',
      referenceType: 'SALES_ORDER',
      referenceId: 'so',
      lines: [{ itemId: 'fin', quantity: 1n, serialNumbers: ['S2'] }],
    });
    expect((await serials.findBySerial('t1', 'S2'))[0]).toMatchObject({
      status: 'ISSUED',
      warehouseId: null,
    });
    await expect(
      ledger.post({
        warehouseId: 'wh-main',
        type: 'ISSUE',
        currency: 'THB',
        referenceType: 'SALES_ORDER',
        referenceId: 'so',
        lines: [{ itemId: 'fin', quantity: 1n, serialNumbers: ['S2'] }],
      }),
    ).rejects.toBeInstanceOf(SerialNotAvailableError);
  });

  it('transfers move stock between warehouses at the carried cost', async () => {
    await receive('raw', 10n, 50_00n, { lotNumber: 'L1' });
    const transfers = new InMemoryTransfers();
    const numbers = { next: async () => 'TR-202609-0001' };
    const tx = new FakeTx();
    const create = new CreateTransferUseCase(
      transfers,
      lots,
      refs,
      numbers,
      tx,
      tenant,
      clock,
    );
    const ship = new ShipTransferUseCase(
      transfers,
      lots,
      ledger,
      outbox,
      tx,
      tenant,
      clock,
    );
    const receiveT = new ReceiveTransferUseCase(
      transfers,
      lots,
      ledger,
      outbox,
      tx,
      tenant,
      clock,
    );
    const t = await create.execute({
      fromWarehouseId: 'wh-main',
      toWarehouseId: 'wh-2',
      lines: [{ itemId: 'raw', quantity: 4n, lotNumber: 'L1' }],
    });
    const shipped = await ship.execute({ transferId: t.id });
    expect(shipped.snapshot().lines[0]?.unitCostMinor).toBe(50_00n);
    expect(
      (await balances.listForItem('t1', 'wh-main', 'raw'))[0]?.balance
        .onHandQty,
    ).toBe(6n);
    await receiveT.execute({ transferId: t.id });
    const dest = await balances.listForItem('t1', 'wh-2', 'raw');
    expect(dest[0]).toMatchObject({
      lotNumber: 'L1',
      balance: { onHandQty: 4n },
    });
    expect(
      (await costs.openLayers('t1', 'wh-2', 'raw', null))[0]?.unitCostMinor,
    ).toBe(50_00n);
  });

  it('expiry sweep alerts at 30/7/1 days and once after expiry, only for lots with stock', async () => {
    await receive('raw', 3n, 1_00n, {
      lotNumber: 'D7',
      expiryDate: '2026-09-09',
    });
    await receive('raw', 3n, 1_00n, {
      lotNumber: 'D8',
      expiryDate: '2026-09-10',
    });
    await receive('raw', 3n, 1_00n, {
      lotNumber: 'GONE',
      expiryDate: '2026-09-01',
    });
    await receive('raw', 1n, 1_00n, {
      lotNumber: 'EMPTY',
      expiryDate: '2026-10-02',
    });
    await ledger.post({
      warehouseId: 'wh-main',
      type: 'ISSUE',
      currency: 'THB',
      referenceType: 'MANUAL_ISSUE',
      referenceId: 'z',
      lines: [{ itemId: 'raw', quantity: 1n, lotNumber: 'EMPTY' }],
    });
    outbox.rows.length = 0;
    const sweep = new ExpiryAlertUseCase(lots, outbox, clock);
    expect(await sweep.execute()).toEqual({
      checked: 4,
      alerted: 1,
      expired: 1,
    });
    expect(outbox.rows.map((r) => r.idempotencyKey.split(':').at(-1))).toEqual(
      expect.arrayContaining(['d7', 'expired']),
    );
  });
});
