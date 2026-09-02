/**
 * Public surface of the inventory module. Sales, purchase and
 * production-order import from HERE and nowhere deeper.
 */
export { InventoryModule } from './inventory.module';
export {
  INVENTORY_GATEWAY,
  type InventoryDocumentRef,
  type InventoryGateway,
  type InventoryIssueInput,
  type InventoryLineInput,
  type InventoryReceiveInput,
  type InventoryReserveInput,
  type PostedMovementView,
  type ReserveOutcome,
} from './application/inventory-gateway';
export { InsufficientStockError, type StockShortage } from './domain';
