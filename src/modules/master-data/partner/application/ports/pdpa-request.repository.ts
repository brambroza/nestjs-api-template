import type { PartnerRef, PdpaRequest, PdpaRequestType } from '../../domain';

export const PDPA_REQUEST_REPOSITORY = Symbol('PDPA_REQUEST_REPOSITORY');

export interface PdpaRequestRepository {
  findById(tenantId: string, id: string): Promise<PdpaRequest | null>;
  findPending(
    tenantId: string,
    partner: PartnerRef,
    requestType: PdpaRequestType,
  ): Promise<PdpaRequest | null>;
  /** Newest first. */
  listByPartner(
    tenantId: string,
    partner: PartnerRef,
  ): Promise<readonly PdpaRequest[]>;
  create(request: PdpaRequest): Promise<void>;
  save(request: PdpaRequest): Promise<void>;
}
