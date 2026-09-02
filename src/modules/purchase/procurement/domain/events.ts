/** Outbox events (ADR 0003) for the procurement flow. */
export interface PurchaseEventBase {
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly occurredAt: Date;
  readonly number: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly actor: string;
}

export interface RequisitionEvent extends PurchaseEventBase {
  readonly type:
    | 'purchase_requisition.submitted.v1'
    | 'purchase_requisition.approved.v1'
    | 'purchase_requisition.rejected.v1'
    | 'purchase_requisition.cancelled.v1';
  readonly requesterId: string;
  readonly awaitingApproval: boolean;
}

export interface PurchaseOrderEvent extends PurchaseEventBase {
  readonly type:
    | 'purchase_order.submitted.v1'
    | 'purchase_order.issued.v1'
    | 'purchase_order.rejected.v1'
    | 'purchase_order.cancelled.v1';
  readonly vendorId: string;
  readonly awaitingApproval: boolean;
  readonly reason: string | null;
}

export interface GoodsReceivedEvent extends PurchaseEventBase {
  readonly type: 'purchase_order.received.v1';
  readonly vendorId: string;
  readonly goodsReceiptId: string;
  readonly goodsReceiptNumber: string;
  readonly warehouseId: string;
  readonly complete: boolean;
}

export type PurchaseEvent =
  RequisitionEvent | PurchaseOrderEvent | GoodsReceivedEvent;
