export const BRANCH_LOOKUP = Symbol('BRANCH_LOOKUP');

export interface BranchLookupResult {
  readonly isActive: boolean;
}

/** Narrow read port — see CompanyLookup in the branch module for rationale. */
export interface BranchLookup {
  find(tenantId: string, branchId: string): Promise<BranchLookupResult | null>;
}
