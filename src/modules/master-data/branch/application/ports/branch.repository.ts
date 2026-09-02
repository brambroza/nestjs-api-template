import type { Branch } from '../../domain';

export const BRANCH_REPOSITORY = Symbol('BRANCH_REPOSITORY');

export interface ListBranchesOptions {
  readonly limit: number;
  readonly offset: number;
  readonly activeOnly: boolean;
  readonly companyId: string | null;
}

export interface BranchRepository {
  findById(tenantId: string, id: string): Promise<Branch | null>;
  findByCode(tenantId: string, code: string): Promise<Branch | null>;
  findByCompanyAndNumber(
    tenantId: string,
    companyId: string,
    branchNumber: string,
  ): Promise<Branch | null>;
  list(
    tenantId: string,
    opts: ListBranchesOptions,
  ): Promise<{ items: readonly Branch[]; total: number }>;
  create(branch: Branch): Promise<void>;
}
