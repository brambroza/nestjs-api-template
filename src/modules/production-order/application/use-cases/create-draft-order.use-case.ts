import { Inject, Injectable } from '@nestjs/common';

import {
  Money,
  OrderId,
  ProductionOrder,
  Quantity,
  type Sku,
} from '../../domain';
import { CLOCK, type Clock } from '../ports/clock.port';
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

export interface CreateDraftOrderInput {
  readonly orderId: OrderId;
  /** Finished good; when set, release resolves the master BOM for it. */
  readonly productSku?: Sku | null;
  readonly orderedQuantity: Quantity;
  readonly totalAmount: Money;
}

/**
 * Draft creation writes only the aggregate; no domain event fires because
 * DRAFT is a state the domain reaches without a transition. The
 * `createdBy` field is stamped from CLS (R10) and is the user who called
 * this use case — R3 will bar this same user from later approving.
 */
@Injectable()
export class CreateDraftOrderUseCase {
  constructor(
    @Inject(PRODUCTION_ORDER_REPOSITORY)
    private readonly repo: ProductionOrderRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TENANT_CONTEXT) private readonly context: TenantContext,
  ) {}

  async execute(input: CreateDraftOrderInput): Promise<void> {
    await this.tx.runInTransaction(async () => {
      const order = ProductionOrder.draft({
        id: input.orderId,
        tenantId: this.context.getTenantId(),
        createdBy: this.context.getUserId(),
        productSku: input.productSku ?? null,
        orderedQuantity: input.orderedQuantity,
        totalAmount: input.totalAmount,
        now: this.clock.now(),
      });
      await this.repo.save(order);
    });
  }
}
