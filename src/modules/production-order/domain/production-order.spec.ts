import {
  IllegalStatusTransitionError,
  OverproductionError,
  SecondApproverMustDifferError,
  SegregationOfDutiesError,
} from './errors';
import { tolerancePolicy } from './policies/tolerance';
import { SimpleThresholdPolicy } from './policies/approval-threshold';
import { ProductionOrder } from './production-order';
import { ProductionOrderStatus } from './production-order-status';
import { Money } from './value-objects/money';
import { Quantity } from './value-objects/quantity';
import { OrderId, TenantId, UserId } from './value-objects/ids';

/**
 * Domain-level unit tests. No Nest, no ports, no repositories. Every
 * rule pinned by name to a real assertion; nothing is mocked because
 * there's nothing to mock — this is a plain class.
 */

const at = (iso: string): Date => new Date(iso);
const tenant = TenantId.of('tenant-a');
const alice = UserId.of('user-alice');
const bob = UserId.of('user-bob');
const carol = UserId.of('user-carol');

function draft(
  overrides: Partial<{
    orderedValue: bigint;
    totalSatang: bigint;
    createdBy: UserId;
  }> = {},
): ProductionOrder {
  return ProductionOrder.draft({
    id: OrderId.of('order-1'),
    tenantId: tenant,
    createdBy: overrides.createdBy ?? alice,
    orderedQuantity: Quantity.of(overrides.orderedValue ?? 100n, 'pcs'),
    totalAmount: Money.thb(overrides.totalSatang ?? 50_000_00n),
    now: at('2026-01-01T00:00:00Z'),
  });
}

describe('ProductionOrder — R1 (state machine)', () => {
  it('DRAFT.submit -> SUBMITTED and emits a submitted event', () => {
    const order = draft();
    order.submit(alice, at('2026-01-02T00:00:00Z'));
    expect(order.status).toBe(ProductionOrderStatus.SUBMITTED);
    expect(order.pendingEvents).toHaveLength(1);
    const [event] = order.pendingEvents;
    expect(event).toMatchObject({
      type: 'production_order.submitted.v1',
      fromStatus: ProductionOrderStatus.DRAFT,
      toStatus: ProductionOrderStatus.SUBMITTED,
      actor: alice,
    });
  });

  it('throws IllegalStatusTransitionError when DRAFT.approve is attempted', () => {
    const order = draft();
    const threshold = new SimpleThresholdPolicy(Money.thb(1_000_000_00n));
    expect(() =>
      order.approve(bob, threshold, at('2026-01-02T00:00:00Z')),
    ).toThrow(IllegalStatusTransitionError);
  });

  it('recall clears approvers and returns SUBMITTED -> DRAFT', () => {
    const order = draft();
    order.submit(alice, at('2026-01-02T00:00:00Z'));
    order.recall(alice, at('2026-01-02T01:00:00Z'));
    expect(order.status).toBe(ProductionOrderStatus.DRAFT);
    expect(order.firstApprover).toBeNull();
    expect(order.secondApprover).toBeNull();
  });
});

describe('ProductionOrder — R3 (segregation of duties)', () => {
  it('rejects when the actor is the createdBy', () => {
    const order = draft({ createdBy: alice });
    order.submit(alice, at('2026-01-02T00:00:00Z'));
    const threshold = new SimpleThresholdPolicy(Money.thb(1_000_000_00n));
    expect(() =>
      order.approve(alice, threshold, at('2026-01-02T01:00:00Z')),
    ).toThrow(SegregationOfDutiesError);
    expect(order.status).toBe(ProductionOrderStatus.SUBMITTED);
    expect(
      order.pendingEvents.filter(
        (e) => e.type === 'production_order.approved.v1',
      ),
    ).toHaveLength(0);
  });
});

describe('ProductionOrder — R2 (dual approval above tenant threshold)', () => {
  const highThreshold = Money.thb(10_000_00n); // 10 000 THB = 1 000 000 satang

  it('with total below threshold, a single approver moves SUBMITTED -> APPROVED', () => {
    const order = draft({ totalSatang: 5_000_00n });
    order.submit(alice, at('2026-01-02T00:00:00Z'));
    order.approve(
      bob,
      new SimpleThresholdPolicy(highThreshold),
      at('2026-01-02T01:00:00Z'),
    );
    expect(order.status).toBe(ProductionOrderStatus.APPROVED);
    expect(order.firstApprover).toBe(bob);
    expect(order.secondApprover).toBeNull();
  });

  it('with total above threshold, one approval does not transition; two distinct do', () => {
    const order = draft({ totalSatang: 50_000_00n });
    order.submit(alice, at('2026-01-02T00:00:00Z'));
    const policy = new SimpleThresholdPolicy(highThreshold);

    order.approve(bob, policy, at('2026-01-02T01:00:00Z'));
    expect(order.status).toBe(ProductionOrderStatus.SUBMITTED);
    expect(order.firstApprover).toBe(bob);
    expect(
      order.pendingEvents.some(
        (e) => e.type === 'production_order.approved.v1',
      ),
    ).toBe(false);

    order.approve(carol, policy, at('2026-01-02T02:00:00Z'));
    expect(order.status).toBe(ProductionOrderStatus.APPROVED);
    expect(order.secondApprover).toBe(carol);
    expect(
      order.pendingEvents.filter(
        (e) => e.type === 'production_order.approved.v1',
      ),
    ).toHaveLength(1);
  });

  it('rejects when the second approver is the same person as the first', () => {
    const order = draft({ totalSatang: 50_000_00n });
    order.submit(alice, at('2026-01-02T00:00:00Z'));
    const policy = new SimpleThresholdPolicy(highThreshold);
    order.approve(bob, policy, at('2026-01-02T01:00:00Z'));
    expect(() =>
      order.approve(bob, policy, at('2026-01-02T02:00:00Z')),
    ).toThrow(SecondApproverMustDifferError);
    expect(order.status).toBe(ProductionOrderStatus.SUBMITTED);
  });
});

describe('ProductionOrder — R7 (every transition emits an event)', () => {
  it('submit, approve, release each append exactly one event to pendingEvents', () => {
    const order = draft({ totalSatang: 100_00n });
    const policy = new SimpleThresholdPolicy(Money.thb(1_000_000_00n));

    order.submit(alice, at('2026-01-02T00:00:00Z'));
    order.approve(bob, policy, at('2026-01-02T01:00:00Z'));
    order.release(bob, at('2026-01-02T02:00:00Z'));

    const types = order.pendingEvents.map((e) => e.type);
    expect(types).toEqual([
      'production_order.submitted.v1',
      'production_order.approved.v1',
      'production_order.released.v1',
    ]);
  });

  it('clearPendingEvents empties the buffer without touching status', () => {
    const order = draft();
    order.submit(alice, at('2026-01-02T00:00:00Z'));
    order.clearPendingEvents();
    expect(order.pendingEvents).toHaveLength(0);
    expect(order.status).toBe(ProductionOrderStatus.SUBMITTED);
  });
});

describe('ProductionOrder — R9 (progressive reporting and tolerance)', () => {
  const policy = new SimpleThresholdPolicy(Money.thb(1_000_000_00n));
  const smallTolerance = tolerancePolicy(500n, 0n); // +5% ceiling, 0% under-tolerance
  const withUnderTolerance = tolerancePolicy(0n, 100n); // no over, 1% under acceptable

  function released(orderedValue: bigint): ProductionOrder {
    const order = draft({ orderedValue });
    order.submit(alice, at('2026-01-02T00:00:00Z'));
    order.approve(bob, policy, at('2026-01-02T01:00:00Z'));
    order.release(bob, at('2026-01-02T02:00:00Z'));
    return order;
  }

  it('first progress report transitions RELEASED -> IN_PROGRESS', () => {
    const order = released(100n);
    order.reportProgress(
      Quantity.of(10n, 'pcs'),
      carol,
      at('2026-01-02T03:00:00Z'),
      smallTolerance,
    );
    expect(order.status).toBe(ProductionOrderStatus.IN_PROGRESS);
    expect(order.producedQuantity.value).toBe(10n);
  });

  it('cumulative production reaching ordered qty transitions to COMPLETED', () => {
    const order = released(10n);
    order.reportProgress(
      Quantity.of(4n, 'pcs'),
      carol,
      at('2026-01-02T03:00:00Z'),
      smallTolerance,
    );
    order.reportProgress(
      Quantity.of(6n, 'pcs'),
      carol,
      at('2026-01-02T04:00:00Z'),
      smallTolerance,
    );
    expect(order.status).toBe(ProductionOrderStatus.COMPLETED);
    const completedEvents = order.pendingEvents.filter(
      (e) => e.type === 'production_order.completed.v1',
    );
    expect(completedEvents).toHaveLength(1);
  });

  it('rejects reporting above ordered × (1 + overBp / 10000)', () => {
    const order = released(100n); // ceiling with 5% over = 105
    expect(() =>
      order.reportProgress(
        Quantity.of(106n, 'pcs'),
        carol,
        at('2026-01-02T03:00:00Z'),
        smallTolerance,
      ),
    ).toThrow(OverproductionError);
    expect(order.status).toBe(ProductionOrderStatus.RELEASED);
    expect(order.producedQuantity.value).toBe(0n);
  });

  it('cumulative crosses ceiling on third report -> rejected, prior reports retained', () => {
    // ordered 200, ceiling with +5% over = 210, floor for completion = 200
    const order = released(200n);
    order.reportProgress(
      Quantity.of(50n, 'pcs'),
      carol,
      at('2026-01-02T03:00:00Z'),
      smallTolerance,
    );
    order.reportProgress(
      Quantity.of(50n, 'pcs'),
      carol,
      at('2026-01-02T04:00:00Z'),
      smallTolerance,
    );
    // cumulative 100, still IN_PROGRESS; a 120 report would land at 220 > 210
    expect(() =>
      order.reportProgress(
        Quantity.of(120n, 'pcs'),
        carol,
        at('2026-01-02T05:00:00Z'),
        smallTolerance,
      ),
    ).toThrow(OverproductionError);
    expect(order.producedQuantity.value).toBe(100n);
    expect(order.status).toBe(ProductionOrderStatus.IN_PROGRESS);
  });

  it('completion floor with underBp 100 (1% under) closes at 99/100', () => {
    const order = released(100n);
    order.reportProgress(
      Quantity.of(99n, 'pcs'),
      carol,
      at('2026-01-02T03:00:00Z'),
      withUnderTolerance,
    );
    expect(order.status).toBe(ProductionOrderStatus.COMPLETED);
  });
});

describe('ProductionOrder — cancellation', () => {
  const policy = new SimpleThresholdPolicy(Money.thb(1_000_000_00n));

  it('DRAFT -> CANCELLED with reason emits a cancelled event', () => {
    const order = draft();
    order.cancel(alice, 'customer withdrew', at('2026-01-02T00:00:00Z'));
    expect(order.status).toBe(ProductionOrderStatus.CANCELLED);
    expect(order.pendingEvents.at(-1)).toMatchObject({
      type: 'production_order.cancelled.v1',
      reason: 'customer withdrew',
    });
  });

  it('IN_PROGRESS -> CANCELLED is blocked by the state machine', () => {
    const order = draft({ orderedValue: 10n });
    order.submit(alice, at('2026-01-02T00:00:00Z'));
    order.approve(bob, policy, at('2026-01-02T01:00:00Z'));
    order.release(bob, at('2026-01-02T02:00:00Z'));
    order.reportProgress(
      Quantity.of(1n, 'pcs'),
      carol,
      at('2026-01-02T03:00:00Z'),
      tolerancePolicy(500n, 0n),
    );
    // now IN_PROGRESS
    expect(() =>
      order.cancel(bob, 'change of mind', at('2026-01-02T04:00:00Z')),
    ).toThrow(IllegalStatusTransitionError);
  });
});
