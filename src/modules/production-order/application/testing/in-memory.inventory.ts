import {
  Quantity,
  type MaterialShortageItem,
  type OrderId,
  type Sku,
} from '../../domain';
import type {
  InventoryPort,
  InventoryRequirement,
  ReservationOutcome,
} from '../ports/inventory.port';

/**
 * Configurable inventory. Preload `available` per SKU; `reserve` computes
 * shortages for missing SKUs and, when everything is available, records
 * the reservation.
 */
export class InMemoryInventory implements InventoryPort {
  private readonly stock = new Map<string, Quantity>();
  readonly reservations: Array<{ orderId: OrderId; at: Date }> = [];

  setStock(sku: Sku, qty: Quantity): void {
    this.stock.set(sku, qty);
  }

  async reserve(
    orderId: OrderId,
    requirements: readonly InventoryRequirement[],
  ): Promise<ReservationOutcome> {
    const shortages: MaterialShortageItem[] = [];
    for (const r of requirements) {
      const available = this.stock.get(r.sku) ?? Quantity.zero(r.required.uom);
      if (r.required.isGreaterThan(available)) {
        shortages.push({
          sku: r.sku,
          required: r.required,
          available,
          shortage: r.required.subtract(available),
        });
      }
    }
    if (shortages.length > 0) {
      return { kind: 'shortage', shortages };
    }
    // Deduct
    for (const r of requirements) {
      const available = this.stock.get(r.sku) ?? Quantity.zero(r.required.uom);
      this.stock.set(r.sku, available.subtract(r.required));
    }
    const reservedAt = new Date();
    this.reservations.push({ orderId, at: reservedAt });
    return {
      kind: 'reserved',
      reservation: { orderId, reservedAt },
    };
  }
}
