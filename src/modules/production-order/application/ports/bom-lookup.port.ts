import type { BomLine, OrderId } from '../../domain';

export const BOM_LOOKUP = Symbol('BOM_LOOKUP');

/**
 * A read-model port owned by production-order but backed by the
 * master-data module in production. Keeping the interface here
 * lets production-order stay independent of master-data's internals;
 * dep-cruiser stops us reaching into master-data/domain directly.
 */
export interface BomLookupPort {
  findByOrderId(orderId: OrderId): Promise<readonly BomLine[]>;
}
