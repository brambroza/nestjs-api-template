import type { PurchaseRequisition, RequisitionStatus } from '../../domain';

export const REQUISITION_REPOSITORY = Symbol('REQUISITION_REPOSITORY');

export interface ListRequisitionsFilter {
  readonly limit: number;
  readonly offset: number;
  readonly status?: RequisitionStatus | null;
  readonly requesterId?: string | null;
}

export interface ListRequisitionsPage {
  readonly items: readonly PurchaseRequisition[];
  readonly total: number;
}

export interface RequisitionRepository {
  findById(tenantId: string, id: string): Promise<PurchaseRequisition | null>;
  list(
    tenantId: string,
    filter: ListRequisitionsFilter,
  ): Promise<ListRequisitionsPage>;
  create(pr: PurchaseRequisition): Promise<void>;
  /** Optimistic lock on version (ADR 0002 §6); returns the entity at version + 1. */
  save(pr: PurchaseRequisition): Promise<PurchaseRequisition>;
}
