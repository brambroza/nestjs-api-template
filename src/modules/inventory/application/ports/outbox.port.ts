import type { InventoryEvent } from '../../domain';

export const INVENTORY_OUTBOX = Symbol('INVENTORY_OUTBOX');

export interface InventoryOutboxEnvelope {
  readonly idempotencyKey: string;
  readonly event: InventoryEvent;
}

export interface InventoryOutbox {
  enqueue(envelope: InventoryOutboxEnvelope): Promise<void>;
}
