import {
  Money,
  OptimisticLockError,
  OrderId,
  ProductionOrder,
  ProductionOrderStatus,
  Quantity,
  SecondApproverMustDifferError,
  SegregationOfDutiesError,
  TenantId,
  UserId,
} from '../../domain';
import {
  AutocommitTransactionManager,
  InMemoryOutbox,
  InMemoryProductionOrderRepository,
  InMemoryTenantContext,
  InMemoryThresholdProvider,
  InMemoryTransactionManager,
  TestClock,
} from '../testing';

import { ApproveOrderUseCase } from './approve-order.use-case';

const tenantA = TenantId.of('tenant-a');
const alice = UserId.of('alice');
const bob = UserId.of('bob');
const carol = UserId.of('carol');

function submittedOrder(
  overrides: Partial<{
    creator: UserId;
    total: bigint;
    orderId: string;
    tenantId: TenantId;
  }> = {},
): ProductionOrder {
  const order = ProductionOrder.draft({
    id: OrderId.of(overrides.orderId ?? 'ord-1'),
    tenantId: overrides.tenantId ?? tenantA,
    createdBy: overrides.creator ?? alice,
    orderedQuantity: Quantity.of(10n, 'pcs'),
    totalAmount: Money.thb(overrides.total ?? 5_000_00n),
    now: new Date('2026-01-01T00:00:00Z'),
  });
  order.submit(alice, new Date('2026-01-02T00:00:00Z'));
  order.clearPendingEvents();
  return order;
}

function makeCtx() {
  const context = new InMemoryTenantContext();
  const repo = new InMemoryProductionOrderRepository(context);
  const outbox = new InMemoryOutbox();
  const tx = new InMemoryTransactionManager([repo, outbox]);
  const clock = new TestClock('2026-01-02T09:00:00Z');
  const thresholds = new InMemoryThresholdProvider();
  const useCase = new ApproveOrderUseCase(
    repo,
    tx,
    outbox,
    clock,
    context,
    thresholds,
  );
  return { context, repo, outbox, tx, clock, thresholds, useCase };
}

describe('ApproveOrderUseCase', () => {
  it('single-approver path: writes save + outbox in one committed transaction', async () => {
    const t = makeCtx();
    t.context.enter(tenantA, bob);
    t.thresholds.set(tenantA, Money.thb(1_000_000_00n));

    const order = submittedOrder({ creator: alice, total: 5_000_00n });
    t.repo.seed(order);

    await t.useCase.execute({ orderId: order.id });

    const stored = t.repo.peek(order.id);
    expect(stored?.status).toBe(ProductionOrderStatus.APPROVED);
    expect(stored?.firstApprover).toBe(bob);
    expect(stored?.secondApprover).toBeNull();
    expect(t.outbox.committedEventTypes()).toEqual([
      'production_order.approved.v1',
    ]);
    // The outbox row's idempotency key is derived from the post-write version
    // (loaded version 0 -> next version 1).
    expect(t.outbox.committedEnvelopes()[0]?.idempotencyKey).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it('R3: creator cannot approve own order — domain error propagates, tx rolls back', async () => {
    const t = makeCtx();
    // policy is permissive, but the aggregate must still block SoD
    t.context.enter(tenantA, alice);
    t.thresholds.set(tenantA, Money.thb(1_000_000_00n));

    const order = submittedOrder({ creator: alice });
    t.repo.seed(order);

    await expect(
      t.useCase.execute({ orderId: order.id }),
    ).rejects.toBeInstanceOf(SegregationOfDutiesError);

    const stored = t.repo.peek(order.id);
    expect(stored?.status).toBe(ProductionOrderStatus.SUBMITTED);
    expect(stored?.version).toBe(0);
    expect(t.outbox.committedEnvelopes()).toHaveLength(0);
  });

  it('R2: dual approval requires two distinct approvers', async () => {
    const t = makeCtx();
    t.thresholds.set(tenantA, Money.thb(10_000_00n)); // 10k THB threshold
    const order = submittedOrder({
      creator: alice,
      total: 50_000_00n, // 50k > threshold
    });
    t.repo.seed(order);

    // First approval by bob — stays SUBMITTED, no outbox row
    t.context.enter(tenantA, bob);
    await t.useCase.execute({ orderId: order.id });
    expect(t.repo.peek(order.id)?.status).toBe(ProductionOrderStatus.SUBMITTED);
    expect(t.repo.peek(order.id)?.firstApprover).toBe(bob);
    expect(t.outbox.committedEventTypes()).toEqual([]);

    // Same person tries again — SecondApproverMustDiffer
    t.context.enter(tenantA, bob);
    await expect(
      t.useCase.execute({ orderId: order.id }),
    ).rejects.toBeInstanceOf(SecondApproverMustDifferError);

    // Distinct second approver — now APPROVED, one outbox row
    t.context.enter(tenantA, carol);
    await t.useCase.execute({ orderId: order.id });
    expect(t.repo.peek(order.id)?.status).toBe(ProductionOrderStatus.APPROVED);
    expect(t.repo.peek(order.id)?.secondApprover).toBe(carol);
    expect(t.outbox.committedEventTypes()).toEqual([
      'production_order.approved.v1',
    ]);
  });

  it('R8 rollback: if outbox.enqueue throws, save is rolled back too', async () => {
    const t = makeCtx();
    t.context.enter(tenantA, bob);
    t.thresholds.set(tenantA, Money.thb(1_000_000_00n));

    const order = submittedOrder({ creator: alice });
    t.repo.seed(order);

    // Poison the outbox — first enqueue throws
    const originalEnqueue = t.outbox.enqueue.bind(t.outbox);
    t.outbox.enqueue = async () => {
      throw new Error('LINE outbox failure');
    };

    await expect(t.useCase.execute({ orderId: order.id })).rejects.toThrow(
      'LINE outbox failure',
    );

    const stored = t.repo.peek(order.id);
    expect(stored?.status).toBe(ProductionOrderStatus.SUBMITTED); // rolled back
    expect(stored?.version).toBe(0);
    expect(t.outbox.committedEnvelopes()).toHaveLength(0);

    // restore for good measure
    t.outbox.enqueue = originalEnqueue;
  });

  it('R10: cross-tenant reach returns not-found (tenant A cannot approve tenant B order)', async () => {
    const t = makeCtx();
    const tenantB = TenantId.of('tenant-b');
    t.thresholds.set(tenantA, Money.thb(1_000_000_00n));

    // Order belongs to tenant B
    const order = submittedOrder({ creator: alice, tenantId: tenantB });
    t.repo.seed(order);

    // Context is tenant A
    t.context.enter(tenantA, bob);

    await expect(
      t.useCase.execute({ orderId: order.id }),
    ).rejects.toMatchObject({ code: 'PRODUCTION_ORDER.NOT_FOUND' });

    expect(t.repo.peek(order.id)?.status).toBe(ProductionOrderStatus.SUBMITTED);
    expect(t.outbox.committedEnvelopes()).toHaveLength(0);
  });

  describe('concurrency (R-concurrency): 20 simultaneous approve calls', () => {
    it('exactly one succeeds, the other 19 fail with OptimisticLockError, exactly one outbox row is written', async () => {
      // Autocommit tx — the point of this scenario is the optimistic lock
      // itself, not the tx staging. AutocommitTransactionManager just runs
      // work; repo.save enforces the version race.
      const context = new InMemoryTenantContext();
      const repo = new InMemoryProductionOrderRepository(context);
      const outbox = new InMemoryOutbox();
      const clock = new TestClock('2026-01-02T09:00:00Z');
      const thresholds = new InMemoryThresholdProvider();
      thresholds.set(tenantA, Money.thb(1_000_000_00n));
      const useCase = new ApproveOrderUseCase(
        repo,
        new AutocommitTransactionManager(),
        outbox,
        clock,
        context,
        thresholds,
      );

      const order = submittedOrder({ creator: alice });
      repo.seed(order);
      context.enter(tenantA, bob);

      const runs = Array.from({ length: 20 }, () =>
        useCase.execute({ orderId: order.id }).then(
          () => 'ok',
          (err: unknown) =>
            err instanceof OptimisticLockError ? '409' : 'other',
        ),
      );
      const results = await Promise.all(runs);

      const successes = results.filter((r) => r === 'ok').length;
      const conflicts = results.filter((r) => r === '409').length;
      const others = results.filter((r) => r === 'other');
      expect(successes).toBe(1);
      expect(conflicts).toBe(19);
      expect(others).toEqual([]);

      // Exactly one approved event was written — the "audit" invariant.
      expect(
        outbox
          .committedEnvelopes()
          .filter((e) => e.event.type === 'production_order.approved.v1'),
      ).toHaveLength(1);

      // Final stored version reflects one successful save.
      expect(repo.peek(order.id)?.status).toBe(ProductionOrderStatus.APPROVED);
      expect(repo.peek(order.id)?.version).toBe(1);
    });
  });
});
