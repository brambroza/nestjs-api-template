import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../../shared/clock';
import { TENANT_CONTEXT, type TenantContext } from '../../../../shared/tenant';
import {
  Branch,
  BranchCompanyInvalidError,
  DuplicateBranchCodeError,
  DuplicateBranchNumberError,
  HEAD_OFFICE_BRANCH_NUMBER,
  type BranchAddress,
} from '../domain';

import {
  BRANCH_REPOSITORY,
  type BranchRepository,
} from './ports/branch.repository';
import {
  COMPANY_LOOKUP,
  type CompanyLookup,
} from './ports/company-lookup.port';

export interface CreateBranchInput {
  readonly companyId: string;
  readonly code: string;
  readonly name: string;
  readonly branchNumber?: string | null;
  readonly address?: Partial<BranchAddress> | null;
}

@Injectable()
export class CreateBranchUseCase {
  constructor(
    @Inject(BRANCH_REPOSITORY) private readonly repo: BranchRepository,
    @Inject(COMPANY_LOOKUP) private readonly companies: CompanyLookup,
    @Inject(TENANT_CONTEXT) private readonly tenant: TenantContext,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateBranchInput): Promise<Branch> {
    const tenantId = this.tenant.getTenantId();
    const branchNumber =
      (input.branchNumber ?? '').trim() || HEAD_OFFICE_BRANCH_NUMBER;

    const [company, byCode, byNumber] = await Promise.all([
      this.companies.find(tenantId, input.companyId),
      this.repo.findByCode(tenantId, input.code.trim()),
      this.repo.findByCompanyAndNumber(tenantId, input.companyId, branchNumber),
    ]);
    if (!company || !company.isActive) {
      throw new BranchCompanyInvalidError(input.companyId);
    }
    if (byCode) {
      throw new DuplicateBranchCodeError(input.code);
    }
    if (byNumber) {
      throw new DuplicateBranchNumberError(input.companyId, branchNumber);
    }

    const branch = Branch.create({
      id: randomUUID(),
      tenantId,
      companyId: input.companyId,
      code: input.code,
      name: input.name,
      branchNumber,
      address: input.address ?? null,
      now: this.clock.now(),
    });
    await this.repo.create(branch);
    return branch;
  }
}
