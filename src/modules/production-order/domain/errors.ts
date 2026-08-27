import { DomainError } from '../../../shared/errors';

import type { ProductionOrderStatus } from './production-order-status';
import type { OrderId, Sku, UserId } from './value-objects';
import type { Quantity } from './value-objects/quantity';

export class IllegalStatusTransitionError extends DomainError {
  readonly code = 'PRODUCTION_ORDER.ILLEGAL_STATUS_TRANSITION';

  constructor(
    readonly from: ProductionOrderStatus,
    readonly to: ProductionOrderStatus,
  ) {
    super(`Illegal transition ${from} -> ${to}`);
  }
}

export class SegregationOfDutiesError extends DomainError {
  readonly code = 'PRODUCTION_ORDER.SEGREGATION_OF_DUTIES';

  constructor(
    readonly orderId: OrderId,
    readonly actor: UserId,
  ) {
    super(`User ${actor} created order ${orderId} and cannot also approve it`);
  }
}

export class DualApprovalRequiredError extends DomainError {
  readonly code = 'PRODUCTION_ORDER.DUAL_APPROVAL_REQUIRED';

  constructor(readonly orderId: OrderId) {
    super(
      `Order ${orderId} exceeds the tenant approval threshold and needs a second approver`,
    );
  }
}

export class SecondApproverMustDifferError extends DomainError {
  readonly code = 'PRODUCTION_ORDER.SECOND_APPROVER_MUST_DIFFER';

  constructor(
    readonly orderId: OrderId,
    readonly actor: UserId,
  ) {
    super(
      `User ${actor} already gave the first approval on ${orderId}; a different approver is required for the second approval`,
    );
  }
}

export class OverproductionError extends DomainError {
  readonly code = 'PRODUCTION_ORDER.OVERPRODUCTION';

  constructor(
    readonly orderId: OrderId,
    readonly ordered: Quantity,
    readonly wouldBe: Quantity,
    readonly toleratedCeiling: Quantity,
  ) {
    super(
      `Reporting would bring produced to ${wouldBe.toJSON().value} ${wouldBe.uom}, above the tolerated ceiling ${toleratedCeiling.toJSON().value}`,
    );
  }
}

export interface MaterialShortageItem {
  readonly sku: Sku;
  readonly required: Quantity;
  readonly available: Quantity;
  readonly shortage: Quantity;
}

export class MaterialShortageError extends DomainError {
  readonly code = 'PRODUCTION_ORDER.MATERIAL_SHORTAGE';

  constructor(
    readonly orderId: OrderId,
    readonly shortages: readonly MaterialShortageItem[],
  ) {
    super(
      `Order ${orderId} cannot be released: ${shortages.length} material(s) short`,
    );
  }
}

export class OptimisticLockError extends DomainError {
  readonly code = 'PRODUCTION_ORDER.OPTIMISTIC_LOCK';

  constructor(
    readonly orderId: OrderId,
    readonly expectedVersion: number,
    readonly actualVersion: number,
  ) {
    super(
      `Order ${orderId} was modified by another actor (expected version ${expectedVersion}, found ${actualVersion})`,
    );
  }
}
