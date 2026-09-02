import { Inject, Injectable } from '@nestjs/common';

import { INVENTORY_GATEWAY, type InventoryGateway } from '../../../inventory';
import {
  Quantity,
  Sku,
  type MaterialShortageItem,
  type OrderId,
} from '../../domain';
import type {
  InventoryPort,
  InventoryRequirement,
  ReservationOutcome,
} from '../../application/ports/inventory.port';

/**
 * T-328: R4 reservations go through the real inventory ledger. The
 * hold lands in the tenant's default warehouse under reference
 * PRODUCTION_ORDER/<orderId>, joins the release transaction, and is
 * released by the inventory gateway when the order is cancelled.
 */
@Injectable()
export class InventoryGatewayAdapter implements InventoryPort {
  constructor(
    @Inject(INVENTORY_GATEWAY) private readonly inventory: InventoryGateway,
  ) {}

  async reserve(
    orderId: OrderId,
    requirements: readonly InventoryRequirement[],
  ): Promise<ReservationOutcome> {
    if (requirements.length === 0) {
      return {
        kind: 'reserved',
        reservation: { orderId, reservedAt: new Date(0) },
      };
    }
    const outcome = await this.inventory.reserve({
      referenceType: 'PRODUCTION_ORDER',
      referenceId: orderId,
      lines: requirements.map((r) => ({
        itemSku: r.sku,
        quantity: r.required.value,
        uomCode: r.required.uom,
      })),
    });
    if (outcome.kind === 'reserved') {
      return {
        kind: 'reserved',
        reservation: { orderId, reservedAt: new Date(0) },
      };
    }
    const shortages: MaterialShortageItem[] = outcome.shortages.map((s) => {
      const required = Quantity.of(s.requiredQty, s.uomCode);
      const available = Quantity.of(s.availableQty, s.uomCode);
      return {
        sku: Sku.of(s.itemSku),
        required,
        available,
        shortage: required.subtract(available),
      };
    });
    return { kind: 'shortage', shortages };
  }
}
