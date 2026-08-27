import {
  DualApprovalRequiredError,
  IllegalStatusTransitionError,
  MaterialShortageError,
  OptimisticLockError,
  OverproductionError,
  SecondApproverMustDifferError,
  SegregationOfDutiesError,
  type MaterialShortageItem,
} from './errors';
import { ProductionOrderStatus } from './production-order-status';
import { OrderId, Sku, UserId } from './value-objects/ids';
import { Quantity } from './value-objects/quantity';

/**
 * Each error carries a stable `code`. The HTTP exception filter (Phase 4)
 * maps codes to responses, so a change to a code is a public API change.
 * These assertions pin the codes down.
 */
describe('domain error codes are stable', () => {
  const orderId = OrderId.of('order-1');
  const alice = UserId.of('alice');

  it('IllegalStatusTransitionError = PRODUCTION_ORDER.ILLEGAL_STATUS_TRANSITION', () => {
    const err = new IllegalStatusTransitionError(
      ProductionOrderStatus.DRAFT,
      ProductionOrderStatus.APPROVED,
    );
    expect(err.code).toBe('PRODUCTION_ORDER.ILLEGAL_STATUS_TRANSITION');
    expect(err.from).toBe(ProductionOrderStatus.DRAFT);
    expect(err.to).toBe(ProductionOrderStatus.APPROVED);
    expect(err.message).toMatch(/DRAFT/);
  });

  it('SegregationOfDutiesError = PRODUCTION_ORDER.SEGREGATION_OF_DUTIES', () => {
    const err = new SegregationOfDutiesError(orderId, alice);
    expect(err.code).toBe('PRODUCTION_ORDER.SEGREGATION_OF_DUTIES');
  });

  it('DualApprovalRequiredError = PRODUCTION_ORDER.DUAL_APPROVAL_REQUIRED', () => {
    const err = new DualApprovalRequiredError(orderId);
    expect(err.code).toBe('PRODUCTION_ORDER.DUAL_APPROVAL_REQUIRED');
  });

  it('SecondApproverMustDifferError = PRODUCTION_ORDER.SECOND_APPROVER_MUST_DIFFER', () => {
    const err = new SecondApproverMustDifferError(orderId, alice);
    expect(err.code).toBe('PRODUCTION_ORDER.SECOND_APPROVER_MUST_DIFFER');
  });

  it('OverproductionError = PRODUCTION_ORDER.OVERPRODUCTION and carries the numeric context', () => {
    const err = new OverproductionError(
      orderId,
      Quantity.of(100n, 'pcs'),
      Quantity.of(110n, 'pcs'),
      Quantity.of(105n, 'pcs'),
    );
    expect(err.code).toBe('PRODUCTION_ORDER.OVERPRODUCTION');
    expect(err.ordered.value).toBe(100n);
    expect(err.wouldBe.value).toBe(110n);
    expect(err.toleratedCeiling.value).toBe(105n);
  });

  it('MaterialShortageError = PRODUCTION_ORDER.MATERIAL_SHORTAGE and lists every missing item', () => {
    const shortages: MaterialShortageItem[] = [
      {
        sku: Sku.of('SKU-A'),
        required: Quantity.of(10n, 'kg'),
        available: Quantity.of(3n, 'kg'),
        shortage: Quantity.of(7n, 'kg'),
      },
      {
        sku: Sku.of('SKU-B'),
        required: Quantity.of(5n, 'kg'),
        available: Quantity.of(0n, 'kg'),
        shortage: Quantity.of(5n, 'kg'),
      },
    ];
    const err = new MaterialShortageError(orderId, shortages);
    expect(err.code).toBe('PRODUCTION_ORDER.MATERIAL_SHORTAGE');
    expect(err.shortages).toHaveLength(2);
    expect(err.shortages[0]?.sku).toBe('SKU-A');
  });

  it('OptimisticLockError = PRODUCTION_ORDER.OPTIMISTIC_LOCK with version numbers', () => {
    const err = new OptimisticLockError(orderId, 3, 5);
    expect(err.code).toBe('PRODUCTION_ORDER.OPTIMISTIC_LOCK');
    expect(err.expectedVersion).toBe(3);
    expect(err.actualVersion).toBe(5);
  });
});
