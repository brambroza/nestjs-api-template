/** Outbox events (ADR 0003) for the sales-order flow. */
export interface SalesOrderEventBase {
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly occurredAt: Date;
  readonly number: string;
  readonly customerId: string;
  readonly totalMinor: bigint;
  readonly currency: string;
  readonly actor: string;
}

export interface SalesOrderSubmittedEvent extends SalesOrderEventBase {
  readonly type: 'sales_order.submitted.v1';
  readonly approvalRequestId: string;
  readonly awaitingApproval: boolean;
  readonly creditStatus: string;
}

export interface SalesOrderResolvedEvent extends SalesOrderEventBase {
  readonly type:
    | 'sales_order.confirmed.v1'
    | 'sales_order.rejected.v1'
    | 'sales_order.cancelled.v1';
  readonly reason: string | null;
}

export interface SalesOrderDeliveredEvent extends SalesOrderEventBase {
  readonly type: 'sales_order.delivered.v1';
  readonly deliveryNoteId: string;
  readonly deliveryNoteNumber: string;
  readonly complete: boolean;
}

export type SalesOrderEvent =
  SalesOrderSubmittedEvent | SalesOrderResolvedEvent | SalesOrderDeliveredEvent;
