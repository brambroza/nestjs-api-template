import { Inject, Injectable } from '@nestjs/common';

import {
  OrderNotFoundError,
  type OrderId,
  type ProductionOrder,
} from '../../domain';
import {
  PRODUCTION_ORDER_REPOSITORY,
  type ProductionOrderRepository,
} from '../ports/production-order.repository';

@Injectable()
export class GetOrderUseCase {
  constructor(
    @Inject(PRODUCTION_ORDER_REPOSITORY)
    private readonly repo: ProductionOrderRepository,
  ) {}

  async execute(orderId: OrderId): Promise<ProductionOrder> {
    const order = await this.repo.findById(orderId);
    if (!order) throw new OrderNotFoundError(orderId);
    return order;
  }
}
