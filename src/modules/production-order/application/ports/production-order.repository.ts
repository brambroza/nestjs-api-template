import type { ProductionOrderStatus } from '../../domain/production-order-status';

export const PRODUCTION_ORDER_REPOSITORY = Symbol(
  'PRODUCTION_ORDER_REPOSITORY',
);

export interface ProductionOrderSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly status: ProductionOrderStatus;
  readonly version: number;
}

export interface ProductionOrderRepository {
  findById(id: string): Promise<ProductionOrderSnapshot | null>;
  save(order: ProductionOrderSnapshot): Promise<void>;
}
