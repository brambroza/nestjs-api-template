import type { PurchaseOrder, PurchaseOrderStatus } from '../../domain';

export const PURCHASE_ORDER_REPOSITORY = Symbol('PURCHASE_ORDER_REPOSITORY');

export interface ListPurchaseOrdersFilter {
  readonly limit: number;
  readonly offset: number;
  readonly status?: PurchaseOrderStatus | null;
  readonly vendorId?: string | null;
}

export interface ListPurchaseOrdersPage {
  readonly items: readonly PurchaseOrder[];
  readonly total: number;
}

export interface PurchaseOrderRepository {
  findById(tenantId: string, id: string): Promise<PurchaseOrder | null>;
  list(
    tenantId: string,
    filter: ListPurchaseOrdersFilter,
  ): Promise<ListPurchaseOrdersPage>;
  create(po: PurchaseOrder): Promise<void>;
  save(po: PurchaseOrder): Promise<PurchaseOrder>;
}
