import type { ConsentRecord, PartnerRef } from '../../domain';

export const CONSENT_REPOSITORY = Symbol('CONSENT_REPOSITORY');

/** Append-only: there is intentionally no update or delete. */
export interface ConsentRepository {
  append(record: ConsentRecord): Promise<void>;
  /** Ordered by recordedAt ascending, then insertion. */
  listByPartner(
    tenantId: string,
    partner: PartnerRef,
  ): Promise<readonly ConsentRecord[]>;
}
