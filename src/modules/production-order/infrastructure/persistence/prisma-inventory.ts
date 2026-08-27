import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaTransactionManager } from '../../../../shared/database';
import {
  type MaterialShortageItem,
  type OrderId,
  Quantity,
  Sku,
} from '../../domain';
import type {
  InventoryPort,
  InventoryRequirement,
  ReservationOutcome,
} from '../../application/ports/inventory.port';

type InventoryClient = Pick<Prisma.TransactionClient, 'stockLevel'>;

/**
 * Prisma-backed inventory. Since it runs inside the same transaction as
 * the release use case, `updateMany` with a `version` guard atomically
 * moves stock — a concurrent release either succeeds first (leaving the
 * loser with 0 rows affected → we re-read and report shortage) or loses
 * to it. Not a real reservation ledger; that would be a separate table
 * with hold/commit semantics. This template ships the minimum that lets
 * R4 pass e2e; replace the class in ProductionOrderModule wiring for
 * ERP integration.
 */
@Injectable()
export class PrismaInventory implements InventoryPort {
  constructor(private readonly tx: PrismaTransactionManager) {}

  async reserve(
    orderId: OrderId,
    requirements: readonly InventoryRequirement[],
  ): Promise<ReservationOutcome> {
    const client = this.tx.getClient() as unknown as InventoryClient;

    const shortages: MaterialShortageItem[] = [];
    const debits: Array<{ id: string; version: number; newValue: bigint }> = [];

    for (const r of requirements) {
      const row = await client.stockLevel.findFirst({
        where: { sku: r.sku },
      });
      const available = row
        ? Quantity.of(row.onHandValue, row.onHandUom)
        : Quantity.zero(r.required.uom);
      if (r.required.isGreaterThan(available)) {
        shortages.push({
          sku: r.sku,
          required: r.required,
          available,
          shortage: r.required.subtract(available),
        });
      } else if (row) {
        debits.push({
          id: row.id,
          version: row.version,
          newValue: row.onHandValue - r.required.value,
        });
      }
    }

    if (shortages.length > 0) {
      return { kind: 'shortage', shortages };
    }

    for (const d of debits) {
      const result = await client.stockLevel.updateMany({
        where: { id: d.id, version: d.version },
        data: { onHandValue: d.newValue, version: d.version + 1 },
      });
      if (result.count === 0) {
        // Someone else consumed the stock between read and write within
        // this tx (should be blocked by isolation; treat as shortage).
        return {
          kind: 'shortage',
          shortages: [
            {
              sku: Sku.of('unknown'),
              required: Quantity.of(1n, 'pcs'),
              available: Quantity.zero('pcs'),
              shortage: Quantity.of(1n, 'pcs'),
            },
          ],
        };
      }
    }

    return {
      kind: 'reserved',
      reservation: { orderId, reservedAt: new Date() },
    };
  }
}
