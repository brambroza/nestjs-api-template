import type { ApprovalRequest } from '../../domain';

export const APPROVAL_REQUEST_REPOSITORY = Symbol(
  'APPROVAL_REQUEST_REPOSITORY',
);

export interface ApprovalRequestRepository {
  findById(tenantId: string, id: string): Promise<ApprovalRequest | null>;
  findPendingForDocument(
    tenantId: string,
    documentType: string,
    documentId: string,
  ): Promise<ApprovalRequest | null>;
  /** Newest first. */
  listForDocument(
    tenantId: string,
    documentType: string,
    documentId: string,
  ): Promise<readonly ApprovalRequest[]>;
  /** PENDING requests whose CURRENT step's approverRole is one of `roles`. */
  listPendingForRoles(
    tenantId: string,
    roles: readonly string[],
  ): Promise<readonly ApprovalRequest[]>;
  create(request: ApprovalRequest): Promise<void>;
  /** Header + step statuses + any new decisions (decisions are append-only). */
  save(request: ApprovalRequest): Promise<void>;
}
