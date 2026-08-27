import {
  IllegalStatusTransitionError,
  OverproductionError,
  SecondApproverMustDifferError,
  SegregationOfDutiesError,
} from './errors';
import type {
  ProductionOrderApprovedEvent,
  ProductionOrderCancelledEvent,
  ProductionOrderCompletedEvent,
  ProductionOrderEvent,
  ProductionOrderProgressReportedEvent,
  ProductionOrderRecalledEvent,
  ProductionOrderReleasedEvent,
  ProductionOrderSubmittedEvent,
} from './events';
import type { ApprovalThresholdPolicy } from './policies/approval-threshold';
import {
  completionFloor,
  overCeiling,
  type TolerancePolicy,
} from './policies/tolerance';
import { ProductionOrderStatus } from './production-order-status';
import { canTransition } from './state-machine';
import type { OrderId, TenantId, UserId } from './value-objects';
import type { Money } from './value-objects/money';
import { Quantity } from './value-objects/quantity';

export interface ProgressReport {
  readonly quantity: Quantity;
  readonly by: UserId;
  readonly at: Date;
}

export interface ProductionOrderSnapshot {
  readonly id: OrderId;
  readonly tenantId: TenantId;
  readonly createdBy: UserId;
  readonly status: ProductionOrderStatus;
  readonly orderedQuantity: Quantity;
  readonly totalAmount: Money;
  readonly firstApprover: UserId | null;
  readonly secondApprover: UserId | null;
  readonly producedQuantity: Quantity;
  readonly progressReports: readonly ProgressReport[];
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface DraftInput {
  readonly id: OrderId;
  readonly tenantId: TenantId;
  readonly createdBy: UserId;
  readonly orderedQuantity: Quantity;
  readonly totalAmount: Money;
  readonly now: Date;
}

/**
 * ProductionOrder aggregate — the only thing allowed to change status.
 * Every mutator either transitions successfully and appends a domain
 * event to `pendingEvents`, or throws a typed `DomainError` and leaves
 * the aggregate untouched. No `new Date()` inside this class; times
 * come from `now` parameters injected by the application layer.
 */
export class ProductionOrder {
  private _status: ProductionOrderStatus;
  private _firstApprover: UserId | null;
  private _secondApprover: UserId | null;
  private _producedQuantity: Quantity;
  private _progressReports: ProgressReport[];
  private _updatedAt: Date;
  private readonly _pendingEvents: ProductionOrderEvent[] = [];

  private constructor(
    readonly id: OrderId,
    readonly tenantId: TenantId,
    readonly createdBy: UserId,
    readonly orderedQuantity: Quantity,
    readonly totalAmount: Money,
    readonly createdAt: Date,
    readonly version: number,
    initialStatus: ProductionOrderStatus,
    initialFirstApprover: UserId | null,
    initialSecondApprover: UserId | null,
    initialProducedQuantity: Quantity,
    initialProgressReports: readonly ProgressReport[],
    initialUpdatedAt: Date,
  ) {
    this._status = initialStatus;
    this._firstApprover = initialFirstApprover;
    this._secondApprover = initialSecondApprover;
    this._producedQuantity = initialProducedQuantity;
    this._progressReports = [...initialProgressReports];
    this._updatedAt = initialUpdatedAt;
  }

  static draft(input: DraftInput): ProductionOrder {
    return new ProductionOrder(
      input.id,
      input.tenantId,
      input.createdBy,
      input.orderedQuantity,
      input.totalAmount,
      input.now,
      0,
      ProductionOrderStatus.DRAFT,
      null,
      null,
      Quantity.zero(input.orderedQuantity.uom),
      [],
      input.now,
    );
  }

  static fromSnapshot(snapshot: ProductionOrderSnapshot): ProductionOrder {
    return new ProductionOrder(
      snapshot.id,
      snapshot.tenantId,
      snapshot.createdBy,
      snapshot.orderedQuantity,
      snapshot.totalAmount,
      snapshot.createdAt,
      snapshot.version,
      snapshot.status,
      snapshot.firstApprover,
      snapshot.secondApprover,
      snapshot.producedQuantity,
      snapshot.progressReports,
      snapshot.updatedAt,
    );
  }

  get status(): ProductionOrderStatus {
    return this._status;
  }
  get firstApprover(): UserId | null {
    return this._firstApprover;
  }
  get secondApprover(): UserId | null {
    return this._secondApprover;
  }
  get producedQuantity(): Quantity {
    return this._producedQuantity;
  }
  get progressReports(): readonly ProgressReport[] {
    return this._progressReports;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }

  /** Events that must be persisted to the outbox in the same transaction. */
  get pendingEvents(): readonly ProductionOrderEvent[] {
    return this._pendingEvents;
  }

  clearPendingEvents(): void {
    this._pendingEvents.length = 0;
  }

  snapshot(): ProductionOrderSnapshot {
    return {
      id: this.id,
      tenantId: this.tenantId,
      createdBy: this.createdBy,
      status: this._status,
      orderedQuantity: this.orderedQuantity,
      totalAmount: this.totalAmount,
      firstApprover: this._firstApprover,
      secondApprover: this._secondApprover,
      producedQuantity: this._producedQuantity,
      progressReports: this._progressReports,
      version: this.version,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    };
  }

  // ------------------------------------------------------------------
  // Transitions
  // ------------------------------------------------------------------

  submit(actor: UserId, now: Date): void {
    this.assertCanTransition(ProductionOrderStatus.SUBMITTED);
    const previous = this._status;
    this._status = ProductionOrderStatus.SUBMITTED;
    this._updatedAt = now;
    const event: ProductionOrderSubmittedEvent = {
      type: 'production_order.submitted.v1',
      aggregateId: this.id,
      tenantId: this.tenantId,
      occurredAt: now,
      actor,
      fromStatus: previous,
      toStatus: this._status,
    };
    this._pendingEvents.push(event);
  }

  recall(actor: UserId, now: Date): void {
    this.assertCanTransition(ProductionOrderStatus.DRAFT);
    const previous = this._status;
    this._status = ProductionOrderStatus.DRAFT;
    this._firstApprover = null;
    this._secondApprover = null;
    this._updatedAt = now;
    const event: ProductionOrderRecalledEvent = {
      type: 'production_order.recalled.v1',
      aggregateId: this.id,
      tenantId: this.tenantId,
      occurredAt: now,
      actor,
      fromStatus: previous,
      toStatus: this._status,
    };
    this._pendingEvents.push(event);
  }

  /**
   * R2 + R3. On above-threshold orders a first `approve` records
   * `firstApprover` without transitioning; a second `approve` by a
   * different user completes the transition to APPROVED.
   */
  approve(actor: UserId, threshold: ApprovalThresholdPolicy, now: Date): void {
    if (this._status !== ProductionOrderStatus.SUBMITTED) {
      throw new IllegalStatusTransitionError(
        this._status,
        ProductionOrderStatus.APPROVED,
      );
    }
    if (actor === this.createdBy) {
      throw new SegregationOfDutiesError(this.id, actor);
    }

    const dualRequired = threshold.requiresDualApproval(this.totalAmount);

    if (dualRequired && this._firstApprover === null) {
      this._firstApprover = actor;
      this._updatedAt = now;
      return;
    }

    if (dualRequired) {
      if (actor === this._firstApprover) {
        throw new SecondApproverMustDifferError(this.id, actor);
      }
      this._secondApprover = actor;
    } else {
      this._firstApprover = actor;
    }

    const previous = this._status;
    this._status = ProductionOrderStatus.APPROVED;
    this._updatedAt = now;

    const event: ProductionOrderApprovedEvent = {
      type: 'production_order.approved.v1',
      aggregateId: this.id,
      tenantId: this.tenantId,
      occurredAt: now,
      actor,
      fromStatus: previous,
      toStatus: this._status,
      firstApprover: this._firstApprover as UserId,
      secondApprover: this._secondApprover,
      totalAmount: this.totalAmount,
    };
    this._pendingEvents.push(event);
  }

  release(actor: UserId, now: Date): void {
    this.assertCanTransition(ProductionOrderStatus.RELEASED);
    const previous = this._status;
    this._status = ProductionOrderStatus.RELEASED;
    this._updatedAt = now;
    const event: ProductionOrderReleasedEvent = {
      type: 'production_order.released.v1',
      aggregateId: this.id,
      tenantId: this.tenantId,
      occurredAt: now,
      actor,
      fromStatus: previous,
      toStatus: this._status,
    };
    this._pendingEvents.push(event);
  }

  /**
   * R9. Reporting is idempotent-free (each call adds); over-tolerance
   * throws. First report on a RELEASED order transitions it to
   * IN_PROGRESS. Reaching the completion floor transitions to COMPLETED.
   */
  reportProgress(
    quantity: Quantity,
    actor: UserId,
    now: Date,
    tolerance: TolerancePolicy,
  ): void {
    if (
      this._status !== ProductionOrderStatus.RELEASED &&
      this._status !== ProductionOrderStatus.IN_PROGRESS
    ) {
      throw new IllegalStatusTransitionError(
        this._status,
        ProductionOrderStatus.IN_PROGRESS,
      );
    }

    const wouldBe = this._producedQuantity.add(quantity);
    const ceiling = overCeiling(this.orderedQuantity, tolerance);
    if (wouldBe.isGreaterThan(ceiling)) {
      throw new OverproductionError(
        this.id,
        this.orderedQuantity,
        wouldBe,
        ceiling,
      );
    }

    const previous = this._status;
    this._producedQuantity = wouldBe;
    this._progressReports.push({ quantity, by: actor, at: now });

    if (previous === ProductionOrderStatus.RELEASED) {
      this._status = ProductionOrderStatus.IN_PROGRESS;
    }

    this._updatedAt = now;

    const progressEvent: ProductionOrderProgressReportedEvent = {
      type: 'production_order.progress_reported.v1',
      aggregateId: this.id,
      tenantId: this.tenantId,
      occurredAt: now,
      actor,
      fromStatus: previous,
      toStatus: this._status,
      reported: quantity,
      cumulative: this._producedQuantity,
    };
    this._pendingEvents.push(progressEvent);

    const floor = completionFloor(this.orderedQuantity, tolerance);
    if (this._producedQuantity.isGreaterThanOrEqual(floor)) {
      const beforeComplete = this._status;
      this._status = ProductionOrderStatus.COMPLETED;
      const completed: ProductionOrderCompletedEvent = {
        type: 'production_order.completed.v1',
        aggregateId: this.id,
        tenantId: this.tenantId,
        occurredAt: now,
        actor,
        fromStatus: beforeComplete,
        toStatus: this._status,
        totalProduced: this._producedQuantity,
      };
      this._pendingEvents.push(completed);
    }
  }

  cancel(actor: UserId, reason: string, now: Date): void {
    // The state-machine table already forbids IN_PROGRESS -> CANCELLED,
    // which covers the "cancel after any progress" rule (first progress
    // report auto-transitions RELEASED -> IN_PROGRESS).
    this.assertCanTransition(ProductionOrderStatus.CANCELLED);
    const previous = this._status;
    this._status = ProductionOrderStatus.CANCELLED;
    this._updatedAt = now;
    const event: ProductionOrderCancelledEvent = {
      type: 'production_order.cancelled.v1',
      aggregateId: this.id,
      tenantId: this.tenantId,
      occurredAt: now,
      actor,
      fromStatus: previous,
      toStatus: this._status,
      reason,
    };
    this._pendingEvents.push(event);
  }

  private assertCanTransition(next: ProductionOrderStatus): void {
    if (!canTransition(this._status, next)) {
      throw new IllegalStatusTransitionError(this._status, next);
    }
  }
}
