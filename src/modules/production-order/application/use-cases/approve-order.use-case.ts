import { Inject, Injectable } from '@nestjs/common';

import { OrderId, OrderNotFoundError } from '../../domain';
import {
  APPROVAL_THRESHOLD,
  type ApprovalThresholdProvider,
} from '../ports/approval-threshold.port';
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
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../ports/transaction.port';

import { persistAndDispatch } from './persistence';

export interface ApproveOrderInput {
  readonly orderId: OrderId;
}

/**
 * R2 + R3. R3 (SoD) is enforced by the aggregate; this use case only
 * hands it the actor and lets it throw. R2 uses the per-tenant threshold
 * provider; when dual approval is required the aggregate stays SUBMITTED
 * on the first call and the outbox receives no `approved` event (nothing
 * happened externally yet — first-approver acknowledgement can be added
 * as a separate event later).
 */
@Injectable()
export class ApproveOrderUseCase {
  constructor(
    @Inject(PRODUCTION_ORDER_REPOSITORY)
    private readonly repo: ProductionOrderRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(OUTBOX) private readonly outbox: OutboxPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TENANT_CONTEXT) private readonly context: TenantContext,
    @Inject(APPROVAL_THRESHOLD)
    private readonly thresholds: ApprovalThresholdProvider,
  ) {}

  async execute(input: ApproveOrderInput): Promise<void> {
    await this.tx.runInTransaction(async () => {
      const order = await this.repo.findById(input.orderId);
      if (!order) throw new OrderNotFoundError(input.orderId);
      const policy = await this.thresholds.forTenant(order.tenantId);
      order.approve(this.context.getUserId(), policy, this.clock.now());
      await persistAndDispatch(order, this.repo, this.outbox);
    });
  }
}
