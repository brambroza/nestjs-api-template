import { Inject, Injectable } from '@nestjs/common';

import {
  computeRequired,
  MaterialShortageError,
  OrderId,
  OrderNotFoundError,
} from '../../domain';
import { BOM_LOOKUP, type BomLookupPort } from '../ports/bom-lookup.port';
import { CLOCK, type Clock } from '../ports/clock.port';
import {
  INVENTORY,
  type InventoryPort,
  type InventoryRequirement,
} from '../ports/inventory.port';
import { OUTBOX, type OutboxPort } from '../ports/outbox.port';
import {
  PRODUCTION_ORDER_REPOSITORY,
  type ProductionOrderRepository,
} from '../ports/production-order.repository';
import {
  TENANT_CONTEXT,
  type TenantContext,
} from '../ports/tenant-context.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../ports/transaction.port';

import { persistAndDispatch } from './persistence';

export interface ReleaseOrderInput {
  readonly orderId: OrderId;
}

/**
 * R4 + R5. Load BOM, compute the required quantity per line, ask the
 * inventory port to reserve. On shortage the domain error carries every
 * missing SKU with required/available/short quantities; the transaction
 * rolls back so no partial reservation lingers.
 */
@Injectable()
export class ReleaseOrderUseCase {
  constructor(
    @Inject(PRODUCTION_ORDER_REPOSITORY)
    private readonly repo: ProductionOrderRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(OUTBOX) private readonly outbox: OutboxPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TENANT_CONTEXT) private readonly context: TenantContext,
    @Inject(INVENTORY) private readonly inventory: InventoryPort,
    @Inject(BOM_LOOKUP) private readonly bom: BomLookupPort,
  ) {}

  async execute(input: ReleaseOrderInput): Promise<void> {
    await this.tx.runInTransaction(async () => {
      const order = await this.repo.findById(input.orderId);
      if (!order) throw new OrderNotFoundError(input.orderId);

      const bomLines = await this.bom.findByOrderId(order.id);
      const requirements: InventoryRequirement[] = bomLines.map((line) => ({
        sku: line.sku,
        required: computeRequired(order.orderedQuantity, line),
      }));

      const outcome = await this.inventory.reserve(order.id, requirements);
      if (outcome.kind === 'shortage') {
        throw new MaterialShortageError(order.id, outcome.shortages);
      }

      order.release(this.context.getUserId(), this.clock.now());
      await persistAndDispatch(order, this.repo, this.outbox);
    });
  }
}
