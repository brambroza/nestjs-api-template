import type {
  InventoryDocumentRef,
  InventoryGateway,
  InventoryIssueInput,
  InventoryReceiveInput,
  InventoryReserveInput,
  PostedMovementView,
  ReserveOutcome,
} from './application/inventory-gateway';

/** Scripted gateway for sibling-module specs. */
export class FakeInventoryGateway implements InventoryGateway {
  reserveOutcome: ReserveOutcome = { kind: 'reserved', warehouseId: 'wh-main' };
  readonly received: InventoryReceiveInput[] = [];
  readonly issued: InventoryIssueInput[] = [];
  readonly reserved: InventoryReserveInput[] = [];
  readonly released: InventoryDocumentRef[] = [];

  receive(
    input: InventoryReceiveInput,
  ): Promise<readonly PostedMovementView[]> {
    this.received.push(input);
    return Promise.resolve([]);
  }
  issue(input: InventoryIssueInput): Promise<readonly PostedMovementView[]> {
    this.issued.push(input);
    return Promise.resolve([]);
  }
  reserve(input: InventoryReserveInput): Promise<ReserveOutcome> {
    this.reserved.push(input);
    return Promise.resolve(this.reserveOutcome);
  }
  release(ref: InventoryDocumentRef): Promise<number> {
    this.released.push(ref);
    return Promise.resolve(1);
  }
  resolveDefaultWarehouse(): Promise<string> {
    return Promise.resolve('wh-main');
  }
}
