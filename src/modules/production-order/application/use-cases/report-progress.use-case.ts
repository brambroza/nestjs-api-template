import { Inject, Injectable } from '@nestjs/common';

import { OrderId, OrderNotFoundError, Quantity } from '../../domain';
import { CLOCK, type Clock } from '../ports/clock.port';
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
  TOLERANCE_POLICY,
  type TolerancePolicyProvider,
} from '../ports/tolerance-policy.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../ports/transaction.port';

import { persistAndDispatch } from './persistence';

export interface ReportProgressInput {
  readonly orderId: OrderId;
  readonly quantity: Quantity;
}

@Injectable()
export class ReportProgressUseCase {
  constructor(
    @Inject(PRODUCTION_ORDER_REPOSITORY)
    private readonly repo: ProductionOrderRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(OUTBOX) private readonly outbox: OutboxPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TENANT_CONTEXT) private readonly context: TenantContext,
    @Inject(TOLERANCE_POLICY)
    private readonly tolerance: TolerancePolicyProvider,
  ) {}

  async execute(input: ReportProgressInput): Promise<void> {
    await this.tx.runInTransaction(async () => {
      const order = await this.repo.findById(input.orderId);
      if (!order) throw new OrderNotFoundError(input.orderId);
      const policy = await this.tolerance.forTenant(order.tenantId);
      order.reportProgress(
        input.quantity,
        this.context.getUserId(),
        this.clock.now(),
        policy,
      );
      await persistAndDispatch(order, this.repo, this.outbox);
    });
  }
}
