import type { Quotation, QuotationStatus } from '../../domain';

export const QUOTATION_REPOSITORY = Symbol('QUOTATION_REPOSITORY');

export interface ListQuotationsFilter {
  readonly limit: number;
  readonly offset: number;
  readonly status?: QuotationStatus | null;
  readonly customerId?: string | null;
}

export interface ListQuotationsPage {
  readonly items: readonly Quotation[];
  readonly total: number;
}

/**
 * `save` implements optimistic locking (ADR 0002 §6): it updates
 * `where version = entity.version`, writes version + 1 and returns the
 * entity at the new version; zero rows affected =
 * QuotationVersionConflictError. `listDueForExpiry` is tenant-free on
 * purpose — the expiry cron runs outside any request.
 */
export interface QuotationRepository {
  findById(tenantId: string, id: string): Promise<Quotation | null>;
  /** All revisions of one number, newest revision first. */
  findRevisions(
    tenantId: string,
    number: string,
  ): Promise<readonly Quotation[]>;
  list(
    tenantId: string,
    filter: ListQuotationsFilter,
  ): Promise<ListQuotationsPage>;
  create(quotation: Quotation): Promise<void>;
  save(quotation: Quotation): Promise<Quotation>;
  listDueForExpiry(
    onDate: string,
    limit: number,
  ): Promise<readonly Quotation[]>;
}
