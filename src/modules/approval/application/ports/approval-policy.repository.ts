import type { ApprovalPolicy } from '../../domain';

export const APPROVAL_POLICY_REPOSITORY = Symbol('APPROVAL_POLICY_REPOSITORY');

export interface ApprovalPolicyRepository {
  findById(tenantId: string, id: string): Promise<ApprovalPolicy | null>;
  findActive(
    tenantId: string,
    documentType: string,
  ): Promise<ApprovalPolicy | null>;
  list(
    tenantId: string,
    opts: { readonly activeOnly: boolean },
  ): Promise<readonly ApprovalPolicy[]>;
  create(policy: ApprovalPolicy): Promise<void>;
  /** Header only (isActive); steps are immutable per policy. */
  save(policy: ApprovalPolicy): Promise<void>;
}
