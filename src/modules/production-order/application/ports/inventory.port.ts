import type {
  MaterialShortageItem,
  OrderId,
  Quantity,
  Sku,
} from '../../domain';

export const INVENTORY = Symbol('INVENTORY');

export interface InventoryRequirement {
  readonly sku: Sku;
  readonly required: Quantity;
}

export interface Reservation {
  readonly orderId: OrderId;
  readonly reservedAt: Date;
}

export type ReservationOutcome =
  | { readonly kind: 'reserved'; readonly reservation: Reservation }
  | {
      readonly kind: 'shortage';
      readonly shortages: readonly MaterialShortageItem[];
    };

/**
 * R4. Reserve materials for a production order. Implementations run
 * inside the same transaction as the order's release, so a failure
 * anywhere in the release use case rolls the reservation back with it.
 */
export interface InventoryPort {
  reserve(
    orderId: OrderId,
    requirements: readonly InventoryRequirement[],
  ): Promise<ReservationOutcome>;
}
