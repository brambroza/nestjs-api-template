import type { ProductionOrderStatus } from './production-order-status';
import type { OrderId, TenantId, UserId } from './value-objects';
import type { Money } from './value-objects/money';
import type { Quantity } from './value-objects/quantity';

interface EventBase {
  readonly aggregateId: OrderId;
  readonly tenantId: TenantId;
  readonly occurredAt: Date;
  readonly actor: UserId;
  readonly fromStatus: ProductionOrderStatus;
  readonly toStatus: ProductionOrderStatus;
}

export interface ProductionOrderSubmittedEvent extends EventBase {
  readonly type: 'production_order.submitted.v1';
}

export interface ProductionOrderRecalledEvent extends EventBase {
  readonly type: 'production_order.recalled.v1';
}

export interface ProductionOrderApprovedEvent extends EventBase {
  readonly type: 'production_order.approved.v1';
  readonly firstApprover: UserId;
  readonly secondApprover: UserId | null;
  readonly totalAmount: Money;
}

export interface ProductionOrderReleasedEvent extends EventBase {
  readonly type: 'production_order.released.v1';
}

export interface ProductionOrderProgressReportedEvent extends EventBase {
  readonly type: 'production_order.progress_reported.v1';
  readonly reported: Quantity;
  readonly cumulative: Quantity;
}

export interface ProductionOrderCompletedEvent extends EventBase {
  readonly type: 'production_order.completed.v1';
  readonly totalProduced: Quantity;
}

export interface ProductionOrderCancelledEvent extends EventBase {
  readonly type: 'production_order.cancelled.v1';
  readonly reason: string;
}

export type ProductionOrderEvent =
  | ProductionOrderSubmittedEvent
  | ProductionOrderRecalledEvent
  | ProductionOrderApprovedEvent
  | ProductionOrderReleasedEvent
  | ProductionOrderProgressReportedEvent
  | ProductionOrderCompletedEvent
  | ProductionOrderCancelledEvent;
