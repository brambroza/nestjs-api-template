import {
  MaterialShortageError,
  Money,
  OrderId,
  ProductionOrder,
  ProductionOrderStatus,
  Quantity,
  Sku,
  TenantId,
  UserId,
  type BomLine,
} from '../../domain';
import {
  InMemoryBomLookup,
  InMemoryInventory,
  InMemoryOutbox,
  InMemoryProductionOrderRepository,
  InMemoryTenantContext,
  InMemoryTransactionManager,
  TestClock,
} from '../testing';

import { ReleaseOrderUseCase } from './release-order.use-case';

const tenantA = TenantId.of('tenant-a');
const alice = UserId.of('alice');
const bob = UserId.of('bob');

function approvedOrder(orderedValue: bigint): ProductionOrder {
  const order = ProductionOrder.draft({
    id: OrderId.of('ord-1'),
    tenantId: tenantA,
    createdBy: alice,
    orderedQuantity: Quantity.of(orderedValue, 'pcs'),
    totalAmount: Money.thb(1_000_00n),
    now: new Date('2026-01-01T00:00:00Z'),
  });
  order.submit(alice, new Date('2026-01-02T00:00:00Z'));
  // Below-threshold order — direct approve
  order.approve(
    bob,
    {
      requiresDualApproval: () => false,
    },
    new Date('2026-01-02T01:00:00Z'),
  );
  order.clearPendingEvents();
  return order;
}

function skuLine(name: string, perUnit: bigint): BomLine {
  return {
    sku: Sku.of(name),
    requiredPerUnit: Quantity.of(perUnit, 'kg'),
    scrapBasisPoints: 0n,
    yieldBasisPoints: 10_000n,
    minPack: Quantity.of(1n, 'kg'),
  };
}

function makeCtx() {
  const context = new InMemoryTenantContext();
  const repo = new InMemoryProductionOrderRepository(context);
  const outbox = new InMemoryOutbox();
  const tx = new InMemoryTransactionManager([repo, outbox]);
  const clock = new TestClock('2026-01-02T02:00:00Z');
  const inventory = new InMemoryInventory();
  const bomLookup = new InMemoryBomLookup();
  const useCase = new ReleaseOrderUseCase(
    repo,
    tx,
    outbox,
    clock,
    context,
    inventory,
    bomLookup,
  );
  return { context, repo, outbox, clock, inventory, bomLookup, useCase };
}

describe('ReleaseOrderUseCase — R4 material shortage', () => {
  it('rejects with a per-SKU shortage list when stock is insufficient', async () => {
    const t = makeCtx();
    t.context.enter(tenantA, bob);

    const order = approvedOrder(100n);
    t.repo.seed(order);

    t.bomLookup.set(order.id, [
      skuLine('MAT-A', 2n), // needs 200 kg
      skuLine('MAT-B', 1n), // needs 100 kg
    ]);
    t.inventory.setStock(Sku.of('MAT-A'), Quantity.of(50n, 'kg'));
    t.inventory.setStock(Sku.of('MAT-B'), Quantity.of(100n, 'kg')); // exactly enough

    let caught: unknown;
    try {
      await t.useCase.execute({ orderId: order.id });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(MaterialShortageError);
    const shortages = (caught as MaterialShortageError).shortages;
    expect(shortages).toHaveLength(1);
    expect(shortages[0]).toEqual(
      expect.objectContaining({
        sku: 'MAT-A',
        required: expect.objectContaining({ value: 200n, uom: 'kg' }),
        available: expect.objectContaining({ value: 50n, uom: 'kg' }),
        shortage: expect.objectContaining({ value: 150n, uom: 'kg' }),
      }),
    );

    // Order stays APPROVED (rollback)
    expect(t.repo.peek(order.id)?.status).toBe(ProductionOrderStatus.APPROVED);
    // No outbox row for a failed release
    expect(t.outbox.committedEnvelopes()).toHaveLength(0);
  });

  it('happy path: stock covers all BOM lines, order transitions to RELEASED and outbox has one event', async () => {
    const t = makeCtx();
    t.context.enter(tenantA, bob);

    const order = approvedOrder(10n);
    t.repo.seed(order);

    t.bomLookup.set(order.id, [
      skuLine('MAT-A', 2n), // needs 20 kg
      skuLine('MAT-B', 1n), // needs 10 kg
    ]);
    t.inventory.setStock(Sku.of('MAT-A'), Quantity.of(100n, 'kg'));
    t.inventory.setStock(Sku.of('MAT-B'), Quantity.of(100n, 'kg'));

    await t.useCase.execute({ orderId: order.id });

    expect(t.repo.peek(order.id)?.status).toBe(ProductionOrderStatus.RELEASED);
    expect(t.outbox.committedEventTypes()).toEqual([
      'production_order.released.v1',
    ]);
  });
});
