/** Outbox events (ADR 0003) — the GL (EPIC-C.4) and dashboards consume these. */
export interface MovementPostedEvent {
  readonly type: 'inventory.movement_posted.v1';
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly occurredAt: Date;
  readonly warehouseId: string;
  readonly itemId: string;
  readonly itemSku: string;
  readonly movementType: string;
  readonly quantity: bigint;
  readonly uomCode: string;
  readonly costMinor: bigint;
  readonly currency: string;
  readonly referenceType: string;
  readonly referenceId: string;
  readonly actor: string;
}

export interface LotExpiringEvent {
  readonly type: 'inventory.lot_expiring.v1' | 'inventory.lot_expired.v1';
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly occurredAt: Date;
  readonly itemId: string;
  readonly lotNumber: string;
  readonly expiryDate: string;
  readonly daysToExpiry: number;
  readonly onHandQty: bigint;
  readonly actor: string;
}

export interface TransferEvent {
  readonly type:
    'inventory.transfer_shipped.v1' | 'inventory.transfer_received.v1';
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly occurredAt: Date;
  readonly number: string;
  readonly fromWarehouseId: string;
  readonly toWarehouseId: string;
  readonly actor: string;
}

export type InventoryEvent =
  MovementPostedEvent | LotExpiringEvent | TransferEvent;
