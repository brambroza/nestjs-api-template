import type { SalesOrder, SalesOrderStatus } from '../../domain';

export const SALES_ORDER_REPOSITORY = Symbol('SALES_ORDER_REPOSITORY');

export interface ListSalesOrdersFilter {
  readonly limit: number;
  readonly offset: number;
  readonly status?: SalesOrderStatus | null;
  readonly customerId?: string | null;
}

export interface ListSalesOrdersPage {
  readonly items: readonly SalesOrder[];
  readonly total: number;
}

/** `save` = optimistic lock on `version` (ADR 0002 §6), returns the entity at version + 1. */
export interface SalesOrderRepository {
  findById(tenantId: string, id: string): Promise<SalesOrder | null>;
  list(
    tenantId: string,
    filter: ListSalesOrdersFilter,
  ): Promise<ListSalesOrdersPage>;
  create(order: SalesOrder): Promise<void>;
  save(order: SalesOrder): Promise<SalesOrder>;
  /** Sum of totalMinor over OPEN_EXPOSURE_STATUSES for the customer in `currency`, excluding one order. */
  sumOpenExposure(
    tenantId: string,
    customerId: string,
    currency: string,
    excludeOrderId: string | null,
  ): Promise<bigint>;
}
