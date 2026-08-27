import type { OrderId, ProductionOrder } from '../../domain';

export const PRODUCTION_ORDER_REPOSITORY = Symbol(
  'PRODUCTION_ORDER_REPOSITORY',
);

/**
 * Repository always operates within the current CLS-scoped
 * transaction (see ADR 0002). The tenant scope is added by the
 * repository implementation from CLS (R10), not by the caller.
 *
 * `save` MUST use optimistic locking against `entity.version` and
 * throw `OptimisticLockError` when the row's stored version has
 * moved. Application code never passes an expected-version — the
 * entity carries it.
 */
export interface ProductionOrderRepository {
  findById(id: OrderId): Promise<ProductionOrder | null>;
  save(entity: ProductionOrder): Promise<void>;
}
